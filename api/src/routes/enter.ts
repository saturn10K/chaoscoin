/**
 * Simplified agent onboarding — two-step, no auth required.
 *
 * Step 1: POST /api/enter
 *   Agent sends { name }. Server generates a wallet and returns it.
 *   Private key is returned ONCE and never stored server-side.
 *   → Returns wallet, config, faucet URL, assigned zone/strategy.
 *
 * Step 2: POST /api/enter/confirm
 *   Agent calls after funding wallet via https://faucet.monad.xyz.
 *   → Verifies balance, registers on-chain, returns agentId.
 */

import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { enterLimiter } from "../middleware/rateLimiter";
import { registerAgent, getAgent, getAgentByOperator, registerERC8004Agent } from "../services/contractService";
import { config } from "../config";

const router = Router();

const STRATEGIES = ["balanced", "aggressive", "defensive", "opportunist", "nomad"] as const;
const ZONE_NAMES: Record<number, string> = {
  0: "The Solar Flats",
  1: "The Graviton Fields",
  2: "The Dark Forest",
  3: "The Nebula Depths",
  4: "The Kuiper Expanse",
  5: "The Trisolaran Reach",
  6: "The Pocket Rim",
  7: "The Singer Void",
};

const MIN_GAS_BALANCE = ethers.parseEther("0.01");

// ─── Step 1: Generate wallet + return config ────────────────────────────────
router.post(
  "/enter",
  enterLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { name } = req.body;

      // Validate name
      if (!name || typeof name !== "string" || name.trim().length === 0) {
        res.status(400).json({ error: "Name is required" });
        return;
      }
      const cleanName = name.trim().slice(0, 32);

      // Generate wallet — private key returned ONCE, never stored server-side
      const wallet = ethers.Wallet.createRandom();

      // Assign random zone + strategy
      const zone = Math.floor(Math.random() * 8);
      const strategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];

      // Auto-fund via devnads faucet (best-effort, 10s timeout)
      let funded = false;
      let faucetTxHash: string | null = null;
      try {
        const faucetRes = await fetch("https://agents.devnads.com/v1/faucet", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ chainId: config.chainId, address: wallet.address }),
          signal: AbortSignal.timeout(10_000),
        });
        if (faucetRes.ok) {
          const data = (await faucetRes.json()) as { txHash: string; amount: string };
          funded = true;
          faucetTxHash = data.txHash;
          console.log(`[enter] Auto-funded ${wallet.address} via devnads faucet (tx: ${data.txHash})`);
        }
      } catch (faucetErr: any) {
        console.warn(`[enter] Faucet auto-fund failed (non-blocking): ${faucetErr.message}`);
      }

      res.status(200).json({
        status: "wallet_created",
        name: cleanName,
        wallet: {
          address: wallet.address,
          privateKey: wallet.privateKey,
        },
        funded,
        faucetTxHash,
        zone,
        zoneName: ZONE_NAMES[zone],
        strategy,
        nextStep: funded
          ? "Your wallet has been funded with MON. Call POST /api/enter/confirm with your address to complete registration."
          : "Fund your wallet at https://faucet.monad.xyz or POST https://agents.devnads.com/v1/faucet, then call POST /api/enter/confirm",
        faucetFallback: "https://faucet.monad.xyz",
        config: {
          rpcUrl: config.rpcUrl,
          chainId: config.chainId,
          apiUrl: `${req.protocol}://${req.get("host")}`,
          contracts: {
            chaosToken: config.contracts.chaosToken,
            agentRegistry: config.contracts.agentRegistry,
            miningEngine: config.contracts.miningEngine,
            rigFactory: config.contracts.rigFactory,
            facilityManager: config.contracts.facilityManager,
            shieldManager: config.contracts.shieldManager,
            cosmicEngine: config.contracts.cosmicEngine,
            zoneManager: config.contracts.zoneManager,
            marketplace: config.contracts.marketplace || undefined,
            sabotage: config.contracts.sabotage || undefined,
          },
        },
      });
    } catch (err: any) {
      console.error("[enter] Error:", err);
      res.status(500).json({ error: "Failed to process entry" });
    }
  }
);

// ─── Step 2: Confirm after faucet funding ─────────────────────────────────
router.post(
  "/enter/confirm",
  enterLimiter,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { address, name, zone: requestedZone } = req.body;

      if (!address || !ethers.isAddress(address)) {
        res.status(400).json({ error: "Valid Ethereum address is required" });
        return;
      }

      // Check if already registered
      const existingId = await getAgentByOperator(address);
      if (existingId > 0) {
        const existing = await getAgent(existingId);
        res.status(409).json({
          error: "Already registered",
          agentId: existingId,
          agent: existing,
        });
        return;
      }

      // Verify funding
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
      const balance = await provider.getBalance(address);
      provider.destroy();

      if (balance < MIN_GAS_BALANCE) {
        res.status(402).json({
          error: "Wallet not funded",
          message: `Address ${address} has ${ethers.formatEther(balance)} MON. Need at least ${ethers.formatEther(MIN_GAS_BALANCE)} MON.`,
          balance: ethers.formatEther(balance),
          required: ethers.formatEther(MIN_GAS_BALANCE),
          faucet: "https://faucet.monad.xyz",
        });
        return;
      }

      // Use zone from /enter step if provided, otherwise randomize
      const zone = (typeof requestedZone === "number" && requestedZone >= 0 && requestedZone <= 7)
        ? requestedZone
        : Math.floor(Math.random() * 8);
      const agentIdentity = `wallet:${address.toLowerCase()}`;
      const { agentId, txHash } = await registerAgent(address, agentIdentity, zone);

      const agentData = await getAgent(Number(agentId));

      // ERC-8004: Mint identity NFT (non-blocking)
      let erc8004AgentId: number | null = null;
      try {
        const agentName = name || `Agent #${agentId}`;
        const erc8004Result = await registerERC8004Agent(
          agentName,
          Number(agentId),
          zone,
          address
        );
        erc8004AgentId = Number(erc8004Result.erc8004AgentId);
        console.log(`  [ERC-8004] Agent #${agentId} → Identity #${erc8004AgentId}`);
      } catch (err: any) {
        console.warn(`  [ERC-8004] Identity mint failed (non-blocking): ${err.message}`);
      }

      res.status(201).json({
        status: "registered",
        agentId: Number(agentId),
        erc8004AgentId,
        address,
        zone,
        zoneName: ZONE_NAMES[zone],
        pioneerPhase: agentData?.pioneerPhase ?? 0,
        registrationTx: txHash,
        dashboard: "https://chaoscoin.fun",
        worldState: `${req.protocol}://${req.get("host")}/api/world/discover`,
      });
    } catch (err: any) {
      console.error("[enter/confirm] Error:", err);
      res.status(500).json({ error: "Registration failed" });
    }
  }
);

export default router;
