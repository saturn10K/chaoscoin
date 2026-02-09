import express from "express";
import cors from "cors";
import { config } from "./config";
import authRoutes from "./routes/auth";
import agentRoutes from "./routes/agents";
import miningRoutes from "./routes/mining";
import eventRoutes from "./routes/events";
import healthRoutes from "./routes/health";

const app = express();

app.use(cors());
app.use(express.json());

// Routes
app.use("/api", authRoutes);
app.use("/api", agentRoutes);
app.use("/api", miningRoutes);
app.use("/api", eventRoutes);
app.use("/api", healthRoutes);

// Root
app.get("/", (_req, res) => {
  res.json({
    name: "Chaoscoin API",
    version: "0.1.0",
    docs: {
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
    },
  });
});

app.listen(config.port, () => {
  console.log(`Chaoscoin API running on port ${config.port}`);
  console.log(`Chain: ${config.rpcUrl} (ID: ${config.chainId})`);
});
