import Database from 'better-sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, '../data/notemind.db');

export function getLeaderboard(period = 'all') {
    const db = new Database(DB_PATH);

    let dateFilter = '';
    if (period === 'week') {
        dateFilter = "AND da.activity_date >= date('now', '-7 days')";
    } else if (period === 'month') {
        dateFilter = "AND da.activity_date >= date('now', 'start of month')";
    }

    // Calculate scores based on activity
    // Score formula: flashcard=1, quiz=5, doc=10
    const query = `
    SELECT 
      u.id as user_id,
      u.username,
      u.display_name,
      COALESCE(SUM(da.flashcards_reviewed), 0) as total_flashcards,
      COALESCE(SUM(da.quizzes_completed), 0) as total_quizzes,
      COALESCE(SUM(da.documents_uploaded), 0) as total_docs,
      (
        COALESCE(SUM(da.flashcards_reviewed), 0) * 1 +
        COALESCE(SUM(da.quizzes_completed), 0) * 5 +
        COALESCE(SUM(da.documents_uploaded), 0) * 10
      ) as score,
      COALESCE(us.current_streak, 0) as current_streak
    FROM users u
    LEFT JOIN daily_activity da ON u.id = da.user_id ${dateFilter}
    LEFT JOIN user_streaks us ON u.id = us.user_id
    GROUP BY u.id
    HAVING score > 0
    ORDER BY score DESC
    LIMIT 100
  `;

    const leaderboard = db.prepare(query).all();
    db.close();
    return leaderboard;
}

export function getUserGoals(userId) {
    const db = new Database(DB_PATH);

    // Get goals
    let goals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(userId);
    if (!goals) {
        // Create defaults if not exist
        db.prepare(`
      INSERT INTO user_goals (user_id) VALUES (?)
    `).run(userId);
        goals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(userId);
    }

    // Get streaks
    let streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);
    if (!streak) {
        db.prepare(`
      INSERT INTO user_streaks (user_id) VALUES (?)
    `).run(userId);
        streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);
    }

    // Get today's activity
    const today = new Date().toISOString().split('T')[0];
    let todayActivity = db.prepare('SELECT * FROM daily_activity WHERE user_id = ? AND activity_date = ?').get(userId, today);
    if (!todayActivity) {
        todayActivity = { flashcards_reviewed: 0, quizzes_completed: 0, documents_uploaded: 0, chat_messages: 0, study_minutes: 0 };
    }

    db.close();

    return {
        goals,
        streak,
        today: todayActivity
    };
}

export function updateUserGoals(userId, { daily_flashcards, daily_quizzes, daily_documents }) {
    const db = new Database(DB_PATH);

    // Ensure goals exist
    const existing = db.prepare('SELECT id FROM user_goals WHERE user_id = ?').get(userId);
    if (!existing) {
        db.prepare('INSERT INTO user_goals (user_id) VALUES (?)').run(userId);
    }

    db.prepare(`
    UPDATE user_goals 
    SET daily_flashcards = COALESCE(?, daily_flashcards),
        daily_quizzes = COALESCE(?, daily_quizzes),
        daily_documents = COALESCE(?, daily_documents),
        updated_at = CURRENT_TIMESTAMP
    WHERE user_id = ?
  `).run(daily_flashcards, daily_quizzes, daily_documents, userId);

    const updatedGoals = db.prepare('SELECT * FROM user_goals WHERE user_id = ?').get(userId);
    db.close();
    return { goals: updatedGoals };
}

export function getActivityHistory(userId, days = 30) {
    const db = new Database(DB_PATH);
    const data = db.prepare(`
    SELECT * FROM daily_activity 
    WHERE user_id = ? AND activity_date >= date('now', '-' || ? || ' days')
    ORDER BY activity_date DESC
  `).all(userId, days);
    db.close();
    return data;
}

export function logActivity(userId, activityType, count = 1) {
    try {
        const db = new Database(DB_PATH);
        const today = new Date().toISOString().split('T')[0];

        // Ensure daily activity record exists
        const existing = db.prepare('SELECT id FROM daily_activity WHERE user_id = ? AND activity_date = ?').get(userId, today);
        if (!existing) {
            db.prepare('INSERT INTO daily_activity (user_id, activity_date) VALUES (?, ?)').run(userId, today);
        }

        // Update the specific activity
        const validColumns = ['flashcards_reviewed', 'quizzes_completed', 'documents_uploaded', 'chat_messages', 'study_minutes'];
        if (validColumns.includes(activityType)) {
            db.prepare(`
        UPDATE daily_activity 
        SET ${activityType} = ${activityType} + ? 
        WHERE user_id = ? AND activity_date = ?
      `).run(count, userId, today);
        }

        // Update streak logic
        const streak = db.prepare('SELECT * FROM user_streaks WHERE user_id = ?').get(userId);
        if (!streak) {
            db.prepare('INSERT INTO user_streaks (user_id, current_streak, longest_streak, last_activity_date) VALUES (?, 1, 1, ?)').run(userId, today);
        } else {
            if (streak.last_activity_date !== today) {
                // Calculate days difference
                const lastDate = new Date(streak.last_activity_date || today);
                const currDate = new Date(today);
                const diffDays = Math.floor((currDate - lastDate) / (1000 * 60 * 60 * 24));

                let newStreak = streak.current_streak;
                if (diffDays === 1) {
                    // Consecutive day
                    newStreak += 1;
                } else if (diffDays > 1) {
                    // Streak broken
                    newStreak = 1;
                } else if (!streak.last_activity_date) {
                    newStreak = 1;
                }

                const longestStreak = Math.max(newStreak, streak.longest_streak);

                db.prepare(`
          UPDATE user_streaks 
          SET current_streak = ?, longest_streak = ?, last_activity_date = ?, updated_at = CURRENT_TIMESTAMP
          WHERE user_id = ?
        `).run(newStreak, longestStreak, today, userId);
            }
        }
        db.close();
    } catch (error) {
        console.error('[ActivityLog] Error:', error.message);
    }
}

export default {
    getLeaderboard,
    getUserGoals,
    updateUserGoals,
    getActivityHistory,
    logActivity
};
