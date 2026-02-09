import express from "express";
import cors from "cors";
import { config } from "./config";
import authRoutes from "./routes/auth";
import agentRoutes from "./routes/agents";
import miningRoutes from "./routes/mining";
import eventRoutes from "./routes/events";
import healthRoutes from "./routes/health";
import socialRoutes from "./routes/social";
import marketplaceRoutes from "./routes/marketplace";
import sabotageRoutes from "./routes/sabotage";
import onboardRoutes from "./routes/onboard";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api", authRoutes);
app.use("/api", agentRoutes);
app.use("/api", miningRoutes);
app.use("/api", eventRoutes);
app.use("/api", healthRoutes);
app.use("/api", socialRoutes);
app.use("/api", marketplaceRoutes);
app.use("/api", sabotageRoutes);
app.use("/api", onboardRoutes);

// Root
app.get("/", (_req, res) => {
  res.json({
    name: "Chaoscoin API",
    version: "0.1.0",
    docs: {
      onboard: "POST /api/onboard (Moltbook auth) — Step 1: generates wallet, agent relays to owner for funding",
      onboardRegister: "POST /api/onboard/register (Moltbook auth) — Step 2: registers after owner funds wallet",
      onboardConfig: "GET /api/onboard/config — public game config (no auth)",
      register: "POST /api/register (Moltbook auth required)",
      heartbeat: "POST /api/heartbeat (Moltbook auth required)",
      miningStatus: "GET /api/mining/status (Moltbook auth required)",
      agents: "GET /api/agents",
      agent: "GET /api/agents/:id",
      leaderboard: "GET /api/leaderboard",
      events: "GET /api/events",
      supply: "GET /api/supply",
      game: "GET /api/game",
      health: "GET /api/health",
      socialFeed: "GET /api/social/feed",
      socialStats: "GET /api/social/stats",
      alliances: "GET /api/social/alliances",
      personalities: "GET /api/social/personalities",
      marketplace: "GET /api/marketplace/listings",
      marketplacePrices: "GET /api/marketplace/prices",
      marketplaceStats: "GET /api/marketplace/stats",
      sabotageEvents: "GET /api/sabotage/events",
      sabotageStats: "GET /api/sabotage/stats",
      negotiations: "GET /api/sabotage/negotiations",
    },
  });
});

app.listen(config.port, () => {
  console.log(`Chaoscoin API running on port ${config.port}`);
  console.log(`Chain: ${config.rpcUrl} (ID: ${config.chainId})`);
});
