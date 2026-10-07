import cron from 'node-cron';
import fs from 'fs';
import db from './database.js';


export function initDocumentCleanup(uploadsDir) {
    // Run every night at 2:00 AM
    cron.schedule('0 2 * * *', () => {
        console.log('[Cleanup] Starting 7-day document cleanup job...');
        try {

            // Find documents older than 7 days
            // SQLite DateTime modifier '-7 days'
            const oldDocs = db.prepare(`
        SELECT id, file_path FROM documents 
        WHERE created_at < datetime('now', '-7 days')
      `).all();

            if (oldDocs.length === 0) {
                console.log('[Cleanup] No documents older than 7 days found.');
                return;
            }

            console.log(`[Cleanup] Found ${oldDocs.length} documents to delete.`);

            const deleteStmt = db.prepare('DELETE FROM documents WHERE id = ?');
            let deletedCount = 0;

            for (const doc of oldDocs) {
                try {
                    // Delete physical file
                    if (doc.file_path && fs.existsSync(doc.file_path)) {
                        fs.unlinkSync(doc.file_path);
                    }

                    // Delete DB record (this will cascade delete flashcards, mindmaps, etc. if foreign keys are setup, 
                    // or we can rely on standard cleanup). In NoteMind, sessions are in JSON chunks, which we should also clean if needed.
                    // However, we didn't store sessions in a normalized way linked by foreign keys, we stored them in text files 
                    // or mem/db. Let's make sure we delete associated DB records.

                    deleteStmt.run(doc.id);
                    deletedCount++;
                } catch (err) {
                    console.error(`[Cleanup] Failed to delete document ${doc.id}:`, err.message);
                }
            }

            console.log(`[Cleanup] Successfully deleted ${deletedCount} documents.`);
        } catch (err) {
            console.error('[Cleanup] Error running cleanup job:', err.message);
        }
    });

    console.log('[Cleanup] 7-day document cleanup cron job scheduled (Runs at 2:00 AM).');
}
