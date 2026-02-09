import { Router, Request, Response } from "express";
import { publicLimiter } from "../middleware/rateLimiter";
import {
  getRecentEvents,
  getSupplyMetrics,
  getGameState,
} from "../services/contractService";

const router = Router();

// GET /api/events — Recent cosmic events
router.get(
  "/events",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const count = Math.min(50, Math.max(1, parseInt(req.query.count as string) || 20));
      const events = await getRecentEvents(count);
      res.json({ events });
    } catch (err: any) {
      console.error("Events error:", err);
      res.status(500).json({ error: "Failed to fetch events" });
    }
  }
);

// GET /api/supply — Supply and burn metrics
router.get(
  "/supply",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const metrics = await getSupplyMetrics();
      res.json(metrics);
    } catch (err: any) {
      console.error("Supply error:", err);
      res.status(500).json({ error: "Failed to fetch supply metrics" });
    }
  }
);

// GET /api/game — Game state (era, phase, zones)
router.get(
  "/game",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const state = await getGameState();
      res.json(state);
    } catch (err: any) {
      console.error("Game state error:", err);
      res.status(500).json({ error: "Failed to fetch game state" });
    }
  }
);

export default router;
