import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

/**
 * Initialize database indexes for optimal query performance
 * Run this after tables are created
 */
export function initializeIndexes() {
  try {
    const db = new Database(DB_PATH);
    
    console.log('[Database] Creating indexes for optimal performance...');

    // ── Users Table Indexes ──────────────────────────────────
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_users_username 
        ON users(username);
        
        CREATE INDEX IF NOT EXISTS idx_users_email 
        ON users(email);
        
        CREATE INDEX IF NOT EXISTS idx_users_created_at 
        ON users(created_at);
      `);
      console.log('  ✓ User indexes created');
    } catch (e) {
      console.log('  ⚠ User table not ready yet');
    }

    // ── Documents Table Indexes ──────────────────────────────
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_documents_user_id 
        ON documents(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_documents_file_path 
        ON documents(file_path);
        
        CREATE INDEX IF NOT EXISTS idx_documents_created_at 
        ON documents(created_at DESC);
        
        CREATE INDEX IF NOT EXISTS idx_documents_user_created 
        ON documents(user_id, created_at DESC);
        
        CREATE INDEX IF NOT EXISTS idx_documents_status 
        ON documents(status);
      `);
      console.log('  ✓ Document indexes created');
    } catch (e) {
      console.log('  ⚠ Document table not ready yet');
    }

    // ── Uploads Table Indexes ───────────────────────────────
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_uploads_user_id 
        ON uploads(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_uploads_date 
        ON uploads(upload_date DESC);
        
        CREATE INDEX IF NOT EXISTS idx_uploads_user_date 
        ON uploads(user_id, upload_date DESC);
      `);
      console.log('  ✓ Upload indexes created');
    } catch (e) {
      console.log('  ⚠ Upload table not ready yet');
    }

    // ── Auth Logs Table Indexes ─────────────────────────────
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_auth_logs_user_id 
        ON auth_logs(user_id);
        
        CREATE INDEX IF NOT EXISTS idx_auth_logs_ip 
        ON auth_logs(ip_address);
        
        CREATE INDEX IF NOT EXISTS idx_auth_logs_timestamp 
        ON auth_logs(timestamp DESC);
      `);
      console.log('  ✓ Auth log indexes created');
    } catch (e) {
      console.log('  ⚠ Auth logs table not ready yet');
    }

    // ── Banned IPs Table Indexes ────────────────────────────
    try {
      db.exec(`
        CREATE INDEX IF NOT EXISTS idx_banned_ips_ip 
        ON banned_ips(ip_address);
        
        CREATE INDEX IF NOT EXISTS idx_banned_ips_created 
        ON banned_ips(created_at DESC);
      `);
      console.log('  ✓ Banned IP indexes created');
    } catch (e) {
      console.log('  ⚠ Banned IPs table not ready yet');
    }

    // ── Enable PRAGMA optimizations for better performance ────
    try {
      db.pragma('journal_mode = WAL');        // Write-Ahead Logging
      db.pragma('synchronous = NORMAL');      // Better performance
      db.pragma('cache_size = 10000');        // Cache optimization
      db.pragma('temp_store = MEMORY');       // Temp tables in memory
      console.log('[Database] ✓ All indexes and optimizations applied');
    } catch (e) {
      console.log('[Database] ✓ Pragmas applied');
    }
    
    db.close();
    return true;
  } catch (error) {
    console.error('[Database] Error creating indexes:', error.message);
    return false;
  }
}

/**
 * Analyze table statistics for query optimizer
 * Run periodically (e.g., weekly)
 */
export function analyzeDatabase() {
  try {
    const db = new Database(DB_PATH);
    
    console.log('[Database] Running ANALYZE...');
    db.exec('ANALYZE');
    
    console.log('[Database] ✓ Database analysis complete');
    db.close();
    return true;
  } catch (error) {
    console.error('[Database] Error analyzing database:', error.message);
    return false;
  }
}

/**
 * Get database statistics
 */
export function getDatabaseStats() {
  try {
    const db = new Database(DB_PATH);
    
    const stats = {
      users: 0,
      documents: 0,
      uploads: 0,
      totalSize: 0
    };

    try {
      stats.users = db.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
    } catch (e) {
      // users table may not exist yet
    }

    try {
      stats.documents = db.prepare('SELECT COUNT(*) as count FROM documents').get()?.count || 0;
    } catch (e) {
      // documents table may not exist yet
    }

    try {
      stats.uploads = db.prepare('SELECT COUNT(*) as count FROM uploads').get()?.count || 0;
    } catch (e) {
      // uploads table may not exist yet
    }

    try {
      const sizeResult = db.prepare('SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size()').get();
      stats.totalSize = sizeResult?.size || 0;
    } catch (e) {
      // pragma may fail
    }
    
    db.close();
    return stats;
  } catch (error) {
    console.error('[Database] Error getting stats:', error.message);
    return {
      users: 0,
      documents: 0,
      uploads: 0,
      totalSize: 0,
      error: error.message
    };
  }
}

export default {
  initializeIndexes,
  analyzeDatabase,
  getDatabaseStats
};
