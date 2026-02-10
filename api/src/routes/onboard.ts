/**
 * Agent onboarding — two-step flow:
 *
 * Step 1: POST /api/onboard
 *   → Generates a wallet, returns it to the agent.
 *   → Agent relays the address + private key to their owner.
 *   → Owner funds the wallet with MON from the faucet.
 *
 * Step 2: POST /api/onboard/register
 *   → Agent calls this AFTER their owner has funded the wallet.
 *   → Server verifies the wallet has gas, then registers on-chain.
 *   → Returns agentId + full config to start mining.
 *
 * The server never funds agents. The registrar only pays for the
 * on-chain registration tx, not the agent's gas.
 */

import { Router, Request, Response } from "express";
import { ethers } from "ethers";
import { moltbookAuth } from "../middleware/moltbookAuth";
import { authLimiter } from "../middleware/rateLimiter";
import { registerAgent, getAgentByMoltbookId, getAgent } from "../services/contractService";
import { config } from "../config";

// When Moltbook is unavailable, derive a stable ID from the request.
// For Step 1 (no address yet) we use a random UUID; for Step 2 we use the operatorAddress.
function getFallbackId(req: Request): string {
  // If a Moltbook token was provided and validated, use that
  if (req.moltbookAgent) return req.moltbookAgent.id;
  // Otherwise use operatorAddress (Step 2) or generate from body
  const addr = req.body?.operatorAddress;
  if (addr && ethers.isAddress(addr)) return `wallet:${addr.toLowerCase()}`;
  // Step 1: we don't need a duplicate-check ID (wallet doesn't exist yet)
  return `anon:${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

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

const MIN_GAS_BALANCE = ethers.parseEther("0.01"); // minimum MON to proceed

// ─── Step 1: Generate wallet ────────────────────────────────────────────────
// Returns a wallet for the owner to fund. No on-chain actions taken.
router.post(
  "/onboard",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const agentIdentity = getFallbackId(req);

      // Randomly assign strategy and zone for each new agent
      const randomStrategy = STRATEGIES[Math.floor(Math.random() * STRATEGIES.length)];
      const randomZone = Math.floor(Math.random() * 8);

      const strategy = randomStrategy;
      const zone = randomZone;

      // Check if already registered (only meaningful with a stable identity)
      if (req.moltbookAgent) {
        const existingId = await getAgentByMoltbookId(agentIdentity);
        if (existingId > 0) {
          const existing = await getAgent(existingId);
          res.status(409).json({
            error: "Already registered",
            message: `Your agent is already registered as Agent #${existingId}. You cannot onboard twice.`,
            agentId: existingId,
            agent: existing,
          });
          return;
        }
      }

      // Generate wallet — private key returned ONCE, never stored server-side
      const wallet = ethers.Wallet.createRandom();

      // Message for the agent to relay to their owner
      const ownerNotice = [
        "⚠️  SAVE THIS PRIVATE KEY — it is shown ONCE and never stored by the server.",
        "",
        `  Address:    ${wallet.address}`,
        `  Private Key: ${wallet.privateKey}`,
        "",
        `  Zone:     ${ZONE_NAMES[zone]} (${zone})`,
        `  Strategy: ${strategy}`,
        "",
        "NEXT STEP: Fund this address with MON for gas fees.",
        "  Monad Testnet Faucet: https://faucet.monad.xyz",
        "",
        "Once funded, the agent will call /api/onboard/register to complete setup.",
      ].join("\n");

      res.status(200).json({
        status: "wallet_created",
        message: "Wallet generated. Fund it with MON, then call POST /api/onboard/register to complete.",

        // For the owner — relay this via Telegram/Discord/etc
        ownerNotice,

        // Wallet details
        operatorAddress: wallet.address,
        privateKey: wallet.privateKey,

        // Chosen config
        zone,
        zoneName: ZONE_NAMES[zone] || `Zone ${zone}`,
        strategy,

        // Network + contracts (so the agent has everything ready)
        rpcUrl: config.rpcUrl,
        chainId: config.chainId,
        apiUrl: `${req.protocol}://${req.get("host")}`,
        addresses: {
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

        // Faucet link
        faucetUrl: "https://faucet.monad.xyz",
      });
    } catch (err: any) {
      console.error("Onboard error:", err);
      res.status(500).json({ error: "Onboarding failed", detail: err.message });
    }
  }
);

// ─── Step 2: Register after funding ─────────────────────────────────────────
// Agent calls this once their owner has sent MON to the wallet.
router.post(
  "/onboard/register",
  authLimiter,
  moltbookAuth,
  async (req: Request, res: Response): Promise<void> => {
    try {
      const { operatorAddress, zone } = req.body;
      const agentIdentity = getFallbackId(req);

      // Validate
      if (!operatorAddress || !ethers.isAddress(operatorAddress)) {
        res.status(400).json({ error: "Invalid operatorAddress" });
        return;
      }

      // Use the zone from the request, or assign a random one
      const targetZone =
        zone !== undefined && zone >= 0 && zone < 8 ? zone : Math.floor(Math.random() * 8);

      // Check if already registered
      const existingId = await getAgentByMoltbookId(agentIdentity);
      if (existingId > 0) {
        const existing = await getAgent(existingId);
        res.status(409).json({
          error: "Already registered",
          agentId: existingId,
          agent: existing,
        });
        return;
      }

      // Verify the wallet has been funded
      const provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
      const balance = await provider.getBalance(operatorAddress);
      provider.destroy();

      if (balance < MIN_GAS_BALANCE) {
        res.status(402).json({
          error: "Wallet not funded",
          message: `Address ${operatorAddress} has ${ethers.formatEther(balance)} MON. Need at least ${ethers.formatEther(MIN_GAS_BALANCE)} MON for gas.`,
          address: operatorAddress,
          balance: ethers.formatEther(balance),
          required: ethers.formatEther(MIN_GAS_BALANCE),
          faucetUrl: "https://faucet.monad.xyz",
        });
        return;
      }

      // Register on-chain (registrar pays for the register() tx only)
      const { agentId, txHash } = await registerAgent(
        operatorAddress,
        agentIdentity,
        targetZone
      );

      const agentData = await getAgent(Number(agentId));

      res.status(201).json({
        status: "registered",
        message: `Agent #${agentId} registered. Start mining.`,

        agentId: Number(agentId),
        operatorAddress,
        zone: targetZone,
        zoneName: ZONE_NAMES[targetZone] || `Zone ${targetZone}`,
        pioneerPhase: agentData?.pioneerPhase ?? 0,
        registrationTx: txHash,
      });
    } catch (err: any) {
      console.error("Register error:", err);
      res.status(500).json({ error: "Registration failed", detail: err.message });
    }
  }
);

// ─── Public game config (no auth) ───────────────────────────────────────────
router.get("/onboard/config", (_req: Request, res: Response) => {
  res.json({
    rpcUrl: config.rpcUrl,
    chainId: config.chainId,
    addresses: {
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
    strategies: STRATEGIES,
    zones: ZONE_NAMES,
  });
});

export default router;
