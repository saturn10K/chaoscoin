import { Router, Request, Response } from "express";
import { publicLimiter } from "../middleware/rateLimiter";
import {
  getAgent,
  getAgentList,
  getContracts,
} from "../services/contractService";

const router = Router();

// GET /api/agents — Paginated agent list
router.get(
  "/agents",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const page = Math.max(1, parseInt(req.query.page as string) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

      const { agents, total } = await getAgentList(page, limit);

      res.json({
        agents,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err: any) {
      console.error("Agent list error:", err);
      res.status(500).json({ error: "Failed to fetch agents" });
    }
  }
);

// GET /api/agents/:id — Full agent profile
router.get(
  "/agents/:id",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const agentId = parseInt(req.params.id);
      if (isNaN(agentId) || agentId < 1) {
        res.status(400).json({ error: "Invalid agent ID" });
        return;
      }

      const agent = await getAgent(agentId);
      if (!agent) {
        res.status(404).json({ error: "Agent not found" });
        return;
      }

      res.json(agent);
    } catch (err: any) {
      console.error("Agent detail error:", err);
      res.status(500).json({ error: "Failed to fetch agent" });
    }
  }
);

// GET /api/leaderboard — Sorted agent list
router.get(
  "/leaderboard",
  publicLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const sortBy = (req.query.sortBy as string) || "hashrate";
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));

      // Fetch all agents (works for MVP with <500 agents)
      const { agents } = await getAgentList(1, 500);
      const active = agents.filter((a) => a.active);

      active.sort((a, b) => {
        switch (sortBy) {
          case "totalMined":
            return Number(BigInt(b.totalMined) - BigInt(a.totalMined));
          case "resilience":
            return Number(BigInt(b.cosmicResilience) - BigInt(a.cosmicResilience));
          case "hashrate":
          default:
            return Number(BigInt(b.hashrate) - BigInt(a.hashrate));
        }
      });

      res.json({
        leaderboard: active.slice(0, limit),
        sortBy,
        total: active.length,
      });
    } catch (err: any) {
      console.error("Leaderboard error:", err);
      res.status(500).json({ error: "Failed to fetch leaderboard" });
    }
  }
);

export default router;
