import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

/**
 * SuperMemo-2 (SM-2) algorithm implementation
 * @param {number} quality - Grade from 0-5 (0: blackout, 3: hard, 4: good, 5: easy)
 * @param {number} repetitions - Current repetition count
 * @param {number} easeFactor - Current ease factor (EF)
 * @param {number} interval - Current interval in days
 * @returns {Object} { newInterval, newRepetitions, newEaseFactor }
 */
function calculateSM2(quality, repetitions, easeFactor, interval) {
    let newInterval;
    let newRepetitions;
    let newEaseFactor;

    if (quality >= 3) {
        if (repetitions === 0) {
            newInterval = 1;
        } else if (repetitions === 1) {
            newInterval = 6;
        } else {
            newInterval = Math.round(interval * easeFactor);
        }
        newRepetitions = repetitions + 1;
    } else {
        // If forgotten, reset repetitions and interval
        newRepetitions = 0;
        newInterval = 1;
    }

    // Calculate new Ease Factor
    newEaseFactor = easeFactor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02));
    if (newEaseFactor < 1.3) {
        newEaseFactor = 1.3;
    }

    return { newInterval, newRepetitions, newEaseFactor };
}

/**
 * Maps a difficulty rating string to an SM-2 quality grade
 * @param {string} difficulty - 'easy', 'good', 'hard', 'again'
 * @returns {number} SM-2 quality grade 0-5
 */
function mapDifficultyToGrade(difficulty) {
    switch (difficulty) {
        case 'easy': return 5;
        case 'good': return 4;
        case 'hard': return 3;
        case 'again': return 0;
        default: return 0;
    }
}

/**
 * Submit a review for a flashcard and update its spaced repetition metrics
 * @param {number} userId - The user reviewing the flashcard
 * @param {string} documentId - Document ID the flashcard belongs to
 * @param {string} flashcardId - The ID of the specific flashcard
 * @param {string} difficulty - 'easy', 'good', 'hard', 'again'
 * @param {number} timeElapsedMs - Optional time taken to answer
 * @returns {Object} The updated metric details
 */
export function reviewFlashcard(userId, documentId, flashcardId, difficulty, timeElapsedMs = 0) {
    try {
        const db = new Database(DB_PATH);
        const quality = mapDifficultyToGrade(difficulty);

        // Get current metrics or create new if first time reviewing
        let metric = db.prepare(`SELECT * FROM flashcard_metrics WHERE flashcard_id = ? AND user_id = ?`).get(flashcardId, userId);

        if (!metric) {
            // Create initial metric
            const insertMetric = db.prepare(`
        INSERT INTO flashcard_metrics 
        (id, flashcard_id, user_id, document_id, ease_factor, interval, repetitions)
        VALUES (?, ?, ?, ?, 2.5, 0, 0)
      `);
            const newId = crypto.randomUUID();
            insertMetric.run(newId, flashcardId, userId, documentId);
            metric = {
                id: newId,
                flashcard_id: flashcardId,
                user_id: userId,
                document_id: documentId,
                ease_factor: 2.5,
                interval: 0,
                repetitions: 0
            };
        }

        // Calculate next review parameters using SM-2
        const { newInterval, newRepetitions, newEaseFactor } = calculateSM2(
            quality,
            metric.repetitions,
            metric.ease_factor,
            metric.interval || 1
        );

        // Calculate next review date (now + interval days)
        const nextReviewDate = new Date();
        nextReviewDate.setDate(nextReviewDate.getDate() + newInterval);
        const nextReviewStr = nextReviewDate.toISOString();

        // Begin transaction
        const updateMetrics = db.transaction(() => {
            // 1. Update the metrics
            db.prepare(`
        UPDATE flashcard_metrics 
        SET ease_factor = ?, 
            interval = ?, 
            repetitions = ?, 
            next_review_date = ?, 
            last_review_date = CURRENT_TIMESTAMP,
            difficulty_level = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(newEaseFactor, newInterval, newRepetitions, nextReviewStr, difficulty, metric.id);

            // 2. Log the review event
            db.prepare(`
        INSERT INTO flashcard_reviews
        (id, flashcard_metric_id, quality_grade, time_elapsed_ms)
        VALUES (?, ?, ?, ?)
      `).run(crypto.randomUUID(), metric.id, quality, timeElapsedMs);
        });

        updateMetrics();
        db.close();

        return {
            success: true,
            nextReviewDate: nextReviewStr,
            intervalDays: newInterval,
            difficulty
        };

    } catch (error) {
        console.error('[SRS] Error updating flashcard review:', error);
        throw error;
    }
}

/**
 * Get flashcards that are due for review for a user/document
 * @param {number} userId - The user ID
 * @param {string} documentId - The document ID
 * @returns {Array} List of flashcard IDs due for review
 */
export function getDueFlashcards(userId, documentId) {
    try {
        const db = new Database(DB_PATH);
        const rows = db.prepare(`
      SELECT flashcard_id, next_review_date, difficulty_level
      FROM flashcard_metrics
      WHERE user_id = ? AND document_id = ?
    `).all(userId, documentId);

        db.close();

        const now = new Date();

        // Process results: due if next_review_date <= now, OR if it has never been reviewed
        return rows.map(row => {
            const isDue = !row.next_review_date || new Date(row.next_review_date) <= now;
            return {
                flashcardId: row.flashcard_id,
                isDue,
                nextReviewDate: row.next_review_date,
                lastDifficulty: row.difficulty_level
            };
        });
    } catch (error) {
        console.error('[SRS] Error fetching due flashcards:', error);
        return [];
    }
}
