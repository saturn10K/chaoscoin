import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { moltbookAuth } from "../middleware/moltbookAuth";
import { authLimiter } from "../middleware/rateLimiter";
import {
  registerAgent,
  getAgentByMoltbookId,
  getAgent,
} from "../services/contractService";
import { RegisterRequest } from "../types";

const router = Router();

function getIdentity(req: Request): string {
  if (req.moltbookAgent) return req.moltbookAgent.id;
  const addr = req.body?.operatorAddress;
  if (addr && ethers.isAddress(addr)) return `wallet:${addr.toLowerCase()}`;
  return `anon:${Date.now()}`;
}

// POST /api/register — Register a new agent
router.post(
  "/register",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { zone, operatorAddress } = req.body as RegisterRequest;
      const identity = getIdentity(req);

      // Validate inputs
      if (zone === undefined || zone < 0 || zone >= 8) {
        res.status(400).json({ error: "Invalid zone (must be 0-7)" });
        return;
      }

      if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
        res
          .status(400)
          .json({ error: "Invalid operatorAddress (must be valid Ethereum address)" });
        return;
      }

      // Check if already registered
      const existingId = await getAgentByMoltbookId(identity);
      if (existingId > 0) {
        const existing = await getAgent(existingId);
        res.status(409).json({
          error: "Agent already registered",
          agentId: existingId,
          agent: existing,
        });
        return;
      }

      // Register onchain
      const { agentId, txHash } = await registerAgent(
        operatorAddress,
        identity,
        zone
      );

      const agent = await getAgent(Number(agentId));

      res.status(201).json({
        agentId: agentId.toString(),
        operatorAddress,
        zone,
        pioneerPhase: agent?.pioneerPhase,
        txHash,
      });
    } catch (err: any) {
      console.error("Registration error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

// POST /api/heartbeat — Send heartbeat (delegates to agent's own EOA in practice)
// This route exists for convenience; agents can also call heartbeat() directly onchain
router.post(
  "/heartbeat",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const identity = getIdentity(req);
      const agentId = await getAgentByMoltbookId(identity);

      if (agentId === 0) {
        res.status(404).json({ error: "Agent not registered" });
        return;
      }

      // Note: heartbeat must be called by the operator EOA directly onchain
      // The API server cannot do this since it uses the registrar wallet
      // This endpoint just returns the agent's heartbeat status
      const agent = await getAgent(agentId);

      res.json({
        agentId,
        lastHeartbeat: agent?.lastHeartbeat,
        active: agent?.active,
        note: "Heartbeat must be sent directly onchain by the operator wallet via AgentRegistry.heartbeat(agentId)",
      });
    } catch (err: any) {
      console.error("Heartbeat error:", err);
      res.status(500).json({ error: "Heartbeat check failed" });
    }
  }
);

export default router;
