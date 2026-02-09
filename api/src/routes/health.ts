import { Router, Request, Response } from "express";
import { getContracts } from "../services/contractService";
import { ethers } from "ethers";
import { config } from "../config";

const router = Router();

// GET /api/health — Server and chain status
router.get("/health", async (_req: Request, res: Response): Promise<void> => {
  try {
    const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
    const blockNumber = await provider.getBlockNumber();

    res.json({
      status: "ok",
      chain: {
        rpc: config.rpcUrl,
        chainId: config.chainId,
        blockNumber,
      },
      contracts: {
        agentRegistry: config.contracts.agentRegistry,
        miningEngine: config.contracts.miningEngine,
        chaosToken: config.contracts.chaosToken,
        cosmicEngine: config.contracts.cosmicEngine,
      },
    });
  } catch (err: any) {
    res.status(503).json({
      status: "error",
      error: err.message,
    });
  }
});

export default router;
