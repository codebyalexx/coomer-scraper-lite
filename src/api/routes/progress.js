
import express from "express";
import { getProgressManager } from "../../lib/progress-manager.js";

const router = express.Router();

router.get("/overall", async (req, res) => {
    try {
        const progressManager = getProgressManager();
        const stats = await progressManager.getOverallStats();
        res.json(stats);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

router.get("/current", (req, res) => {
    try {
        const progressManager = getProgressManager();
        const current = progressManager.getCurrentProgress();
        res.json(current);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

export default router;
