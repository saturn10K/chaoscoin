/**
 * GET /api/world/discover — Unified world state for agents.
 *
 * Returns everything an agent needs in a single call:
 * network config, contracts, game state, zones, leaderboard,
 * marketplace prices, recent events, recent social messages.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { publicLimiter } from "../middleware/rateLimiter";
import {
  getGameState,
  getSupplyMetrics,
  getAgentList,
  getRecentEvents,
} from "../services/contractService";
import { config } from "../config";

const router = Router();

const DATA_DIR = path.join(__dirname, "../../data");

function loadJSON<T>(file: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(path.join(DATA_DIR, file), "utf-8"));
  } catch {
    return [];
  }
}

const ZONE_INFO = [
  { id: 0, name: "The Solar Flats", bonus: "+15% hashrate", risk: "2x solar damage" },
  { id: 1, name: "The Graviton Fields", bonus: "-10% hashrate", risk: "0.5x damage" },
  { id: 2, name: "The Dark Forest", bonus: "+5% hashrate", risk: "Hidden threats" },
  { id: 3, name: "The Nebula Depths", bonus: "+10% hashrate", risk: "Moderate" },
  { id: 4, name: "The Kuiper Expanse", bonus: "+0%", risk: "Low risk" },
  { id: 5, name: "The Trisolaran Reach", bonus: "+8% hashrate", risk: "Moderate" },
  { id: 6, name: "The Pocket Rim", bonus: "+8% hashrate", risk: "Moderate" },
  { id: 7, name: "The Singer Void", bonus: "+3% hashrate", risk: "0.7x damage" },
];

const RIG_PRICES: Record<number, string> = {
  0: "0",
  1: "5000",
  2: "25000",
  3: "100000",
  4: "350000",
};

// Cache to avoid hammering on-chain reads on every request
let cachedResponse: object | null = null;
let cacheTimestamp = 0;
const CACHE_TTL = 30_000; // 30 seconds

router.get(
  "/world/discover",
  publicLimiter,
  async (_req: Request, res: Response): Promise<void> => {
    try {
      const now = Date.now();
      if (cachedResponse && now - cacheTimestamp < CACHE_TTL) {
        res.json(cachedResponse);
        return;
      }

      // Parallel fetch on-chain data
      const [gameState, supply, agentList, recentEvents] = await Promise.all([
        getGameState().catch(() => null),
        getSupplyMetrics().catch(() => null),
        getAgentList(1, 100).catch(() => ({ agents: [], total: 0 })),
        getRecentEvents(10).catch(() => []),
      ]);

      // Build leaderboard from agent list
      const activeAgents = agentList.agents.filter((a: any) => a.active);
      const byHashrate = [...activeAgents]
        .sort((a: any, b: any) => Number(b.hashrate) - Number(a.hashrate))
        .slice(0, 20)
        .map((a: any) => ({
          agentId: Number(a.agentId),
          hashrate: Number(a.hashrate),
          zone: a.zone,
          totalMined: a.totalMined,
          shieldLevel: a.shieldLevel,
        }));
      const byTotalMined = [...activeAgents]
        .sort((a: any, b: any) => parseFloat(b.totalMined) - parseFloat(a.totalMined))
        .slice(0, 20)
        .map((a: any) => ({
          agentId: Number(a.agentId),
          hashrate: Number(a.hashrate),
          zone: a.zone,
          totalMined: a.totalMined,
          shieldLevel: a.shieldLevel,
        }));

      // Load marketplace data from disk
      const listings: any[] = loadJSON("marketplace-listings.json");
      const sales: any[] = loadJSON("marketplace-sales.json");
      const activeListings = listings.filter((l: any) => l.status === "active").length;

      // Load recent social messages
      const socialMessages: any[] = loadJSON("social-feed.json");
      const recentMessages = socialMessages.slice(-20).reverse();

      // Build zone info with agent counts
      const zoneCounts = gameState?.zoneCounts || Array(8).fill(0);
      const zones = ZONE_INFO.map((z) => ({
        ...z,
        agents: zoneCounts[z.id] || 0,
      }));

      const response = {
        network: {
          rpcUrl: config.rpcUrl,
          chainId: config.chainId,
        },

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

        game: {
          totalAgents: gameState?.activeAgentCount ?? agentList.total,
          zoneCounts,
          zones,
          era: gameState ? {
            current: gameState.era,
            modifier: gameState.eraModifier,
            maxEventTier: gameState.maxEventTier,
            eventCooldown: gameState.eventCooldown,
          } : null,
          genesisPhase: gameState?.genesisPhase ?? 0,
          lastEventBlock: gameState?.lastEventBlock ?? "0",
        },

        supply: supply ? {
          totalMinted: supply.totalMinted,
          totalBurned: supply.totalBurned,
          circulatingSupply: supply.circulatingSupply,
          burnRatio: supply.burnRatio,
        } : null,

        leaderboard: {
          byHashrate,
          byTotalMined,
        },

        marketplace: {
          rigPrices: RIG_PRICES,
          activeListings,
          totalSales: sales.length,
        },

        recentEvents: recentEvents.map((e: any) => ({
          eventType: e.eventType,
          severityTier: e.severityTier,
          originZone: e.originZone,
          triggerBlock: e.triggerBlock,
        })),

        recentMessages: recentMessages.map((m: any) => ({
          agentId: m.agentId,
          agentTitle: m.agentTitle,
          type: m.type,
          text: m.text,
          zone: m.zone,
          timestamp: m.timestamp,
        })),

        meta: {
          timestamp: now,
          apiVersion: "1.0",
        },
      };

      cachedResponse = response;
      cacheTimestamp = now;
      res.json(response);
    } catch (err: any) {
      console.error("[world/discover] Error:", err);
      res.status(500).json({ error: "Failed to fetch world state" });
    }
  }
);

export default router;
