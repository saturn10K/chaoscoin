import { Router, Request, Response } from "express";
import { moltbookAuth } from "../middleware/moltbookAuth";
import { authLimiter } from "../middleware/rateLimiter";
import {
  getAgentByMoltbookId,
  getMiningStatus,
} from "../services/contractService";

const router = Router();

// GET /api/mining/status — Current mining status for authenticated agent
router.get(
  "/mining/status",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const moltbookAgent = req.moltbookAgent!;
      const agentId = await getAgentByMoltbookId(moltbookAgent.id);

      if (agentId === 0) {
        res.status(404).json({ error: "Agent not registered" });
        return;
      }

      const status = await getMiningStatus(agentId);
      res.json({ agentId, ...status });
    } catch (err: any) {
      console.error("Mining status error:", err);
      res.status(500).json({ error: "Failed to fetch mining status" });
    }
  }
);

// POST /api/mining/claim — Note: claims must be done directly onchain
router.post(
  "/mining/claim",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const moltbookAgent = req.moltbookAgent!;
      const agentId = await getAgentByMoltbookId(moltbookAgent.id);

      if (agentId === 0) {
        res.status(404).json({ error: "Agent not registered" });
        return;
      }

      const status = await getMiningStatus(agentId);

      res.json({
        agentId,
        pendingRewards: status.pendingRewards,
        note: "Claims must be executed directly onchain by the operator wallet via MiningEngine.claimRewards(agentId)",
      });
    } catch (err: any) {
      console.error("Mining claim error:", err);
      res.status(500).json({ error: "Failed to check claim status" });
    }
  }
);

export default router;
