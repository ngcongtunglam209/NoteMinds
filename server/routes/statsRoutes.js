import express from 'express';
import { requireAuth } from '../services/authService.js';
import { getLeaderboard, getUserGoals, updateUserGoals, getActivityHistory, logActivity } from '../services/statsService.js';

const router = express.Router();

router.get('/leaderboard', async (req, res) => {
    try {
        const period = req.query.period || 'all';
        const data = getLeaderboard(period);
        res.json({ leaderboard: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/goals', requireAuth, async (req, res) => {
    try {
        const data = getUserGoals(req.user.id);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.put('/goals', requireAuth, async (req, res) => {
    try {
        const data = updateUserGoals(req.user.id, req.body);
        res.json(data);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.get('/activity/history', requireAuth, async (req, res) => {
    try {
        const days = parseInt(req.query.days) || 30;
        const data = getActivityHistory(req.user.id, days);
        res.json({ history: data });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

router.post('/activity/track', requireAuth, async (req, res) => {
    try {
        const { type } = req.body;
        logActivity(req.user.id, type);
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
