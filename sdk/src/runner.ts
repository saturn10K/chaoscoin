/**
 * Agent Runner — Spins up 5 autonomous mining agents with different strategies.
 *
 * Persists wallets to .wallets.json so agents survive restarts.
 * On restart, reconnects to existing on-chain agents instead of creating new ones.
 *
 * Usage: npx tsx src/runner.ts
 */

import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { MinerAgent, Strategy } from "./MinerAgent";
import { ContractAddresses } from "./ChainClient";

// ── Load .env from sdk root ─────────────────────────────────────────────────
dotenv.config({ path: path.join(__dirname, "..", ".env") });

// ── Config ──────────────────────────────────────────────────────────────────

const RPC_URL = process.env.RPC_URL || "https://testnet-rpc.monad.xyz";
const CHAIN_ID = parseInt(process.env.CHAIN_ID || "10143");
const API_URL = process.env.API_URL || "http://localhost:3001";

const REGISTRAR_KEY = process.env.REGISTRAR_PRIVATE_KEY;
if (!REGISTRAR_KEY) {
  console.error("ERROR: REGISTRAR_PRIVATE_KEY not set in .env");
  process.exit(1);
}

const ADDRESSES: ContractAddresses = {
  chaosToken: process.env.CHAOS_TOKEN_ADDRESS || "",
  agentRegistry: process.env.AGENT_REGISTRY_ADDRESS || "",
  miningEngine: process.env.MINING_ENGINE_ADDRESS || "",
  rigFactory: process.env.RIG_FACTORY_ADDRESS || "",
  facilityManager: process.env.FACILITY_MANAGER_ADDRESS || "",
  shieldManager: process.env.SHIELD_MANAGER_ADDRESS || "",
  cosmicEngine: process.env.COSMIC_ENGINE_ADDRESS || "",
  zoneManager: process.env.ZONE_MANAGER_ADDRESS || "",
};

const AGENT_CONFIGS: { strategy: Strategy; zone: number; label: string }[] = [
  { strategy: "balanced", zone: 3, label: "Balanced (Nebula Depths)" },
  { strategy: "aggressive", zone: 0, label: "Aggressive (Solar Flats)" },
  { strategy: "defensive", zone: 1, label: "Defensive (Graviton Fields)" },
  { strategy: "opportunist", zone: 6, label: "Opportunist (Pocket Rim)" },
  { strategy: "nomad", zone: 7, label: "Nomad (Singer Void)" },
];

const REGISTRY_ABI = [
  "function register(address operator, bytes32 moltbookIdHash, uint8 zone) external returns (uint256)",
  "function agentByOperator(address) external view returns (uint256)",
  "function nextAgentId() external view returns (uint256)",
];

// ── Wallet Persistence ──────────────────────────────────────────────────────

const WALLETS_FILE = path.join(__dirname, "..", ".wallets.json");

interface SavedWallet {
  index: number;
  label: string;
  address: string;
  privateKey: string;
  agentId?: number;
}

function loadWallets(): SavedWallet[] | null {
  try {
    if (fs.existsSync(WALLETS_FILE)) {
      const data = JSON.parse(fs.readFileSync(WALLETS_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) {
        return data;
      }
    }
  } catch (err: any) {
    console.warn(`⚠ Could not load wallets file: ${err.message}`);
  }
  return null;
}

function saveWallets(wallets: SavedWallet[]): void {
  fs.writeFileSync(WALLETS_FILE, JSON.stringify(wallets, null, 2));
  console.log(`  💾 Wallets saved to ${WALLETS_FILE}`);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function makeProvider(): ethers.JsonRpcProvider {
  const staticNetwork = new ethers.Network("monad-testnet", CHAIN_ID);
  const provider = new ethers.JsonRpcProvider(RPC_URL, staticNetwork, {
    staticNetwork,
    batchMaxCount: 1, // No batching — easier to throttle
    pollingInterval: 30_000, // Slow down auto-polling to 30s
  });
  return provider;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
  const provider = makeProvider();
  const registrar = new ethers.Wallet(REGISTRAR_KEY, provider);

  console.log("═══════════════════════════════════════════");
  console.log("  CHAOSCOIN AGENT RUNNER");
  console.log("═══════════════════════════════════════════");
  console.log(`Registrar: ${registrar.address}`);
  console.log("");

  const registry = new ethers.Contract(ADDRESSES.agentRegistry, REGISTRY_ABI, registrar);

  // ── Load or create wallets ──
  let savedWallets = loadWallets();
  let agentWallets: ethers.Wallet[] = [];
  let isReconnect = false;

  if (savedWallets && savedWallets.length === AGENT_CONFIGS.length) {
    console.log("🔄 Found saved wallets — reconnecting to existing agents\n");
    isReconnect = true;
    for (const sw of savedWallets) {
      const wallet = new ethers.Wallet(sw.privateKey, provider);
      agentWallets.push(wallet);
      console.log(`Agent ${sw.index + 1} (${sw.label}): ${wallet.address}${sw.agentId ? ` → Agent #${sw.agentId}` : ""}`);
    }
  } else {
    console.log("🆕 No saved wallets found — creating new agents\n");
    const newSaved: SavedWallet[] = [];
    for (let i = 0; i < AGENT_CONFIGS.length; i++) {
      const wallet = ethers.Wallet.createRandom().connect(provider) as ethers.HDNodeWallet;
      agentWallets.push(wallet);
      newSaved.push({
        index: i,
        label: AGENT_CONFIGS[i].label,
        address: wallet.address,
        privateKey: wallet.privateKey,
      });
      console.log(`Agent ${i + 1} (${AGENT_CONFIGS[i].label}): ${wallet.address}`);
    }
    saveWallets(newSaved);
    savedWallets = newSaved;
  }

  // ── Phase 1: Fund + Register (skip if already registered) ──
  console.log("\n── Funding & Registering ──");
  const gasAmount = ethers.parseEther("0.5");

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const wallet = agentWallets[i];

    // Check if already registered
    await sleep(2000);
    const existingId = await registry.agentByOperator(wallet.address);
    if (Number(existingId) > 0) {
      console.log(`\n  [Agent ${i + 1}] Already registered as #${existingId}`);
      // Update saved wallet with agentId
      if (savedWallets) {
        savedWallets[i].agentId = Number(existingId);
      }
      // Check if needs more gas
      const bal = await provider.getBalance(wallet.address);
      if (bal < ethers.parseEther("0.05")) {
        console.log(`  [Agent ${i + 1}] Low gas — topping up...`);
        await sleep(2000);
        const fundTx = await registrar.sendTransaction({ to: wallet.address, value: gasAmount });
        await fundTx.wait();
        console.log(`  [Agent ${i + 1}] ✓ Topped up`);
      }
      continue;
    }

    // Fund
    console.log(`\n  [Agent ${i + 1}] Funding with 0.5 MON...`);
    await sleep(3000);
    const fundTx = await registrar.sendTransaction({ to: wallet.address, value: gasAmount });
    await fundTx.wait();
    console.log(`  [Agent ${i + 1}] ✓ Funded`);

    // Register
    const moltbookIdHash = ethers.keccak256(
      ethers.solidityPacked(["string", "address"], ["chaoscoin-agent-", wallet.address])
    );

    console.log(`  [Agent ${i + 1}] Registering ${cfg.label} in zone ${cfg.zone}...`);
    await sleep(2000);
    try {
      const regTx = await registry.register(wallet.address, moltbookIdHash, cfg.zone);
      await regTx.wait();
      await sleep(1500);
      const nextId = await registry.nextAgentId();
      const agentId = Number(nextId) - 1;
      console.log(`  [Agent ${i + 1}] ✓ Registered as agent #${agentId}`);
      // Save agentId
      if (savedWallets) {
        savedWallets[i].agentId = agentId;
      }
    } catch (err: any) {
      console.error(`  [Agent ${i + 1}] ✗ Registration failed: ${err.message}`);
    }
  }

  // Save updated wallet data (with agentIds)
  if (savedWallets) {
    saveWallets(savedWallets);
  }

  // Destroy the registration provider to stop its poller
  provider.destroy();

  // ── Phase 2: Start agents one at a time ──
  console.log("\n── Starting mining agents (one at a time, 90s cycle) ──\n");

  const agents: MinerAgent[] = [];

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const wallet = agentWallets[i];

    const agent = new MinerAgent({
      privateKey: wallet.privateKey,
      moltbookApiKey: "not-needed",
      apiUrl: API_URL,
      rpcUrl: RPC_URL,
      chainId: CHAIN_ID,
      addresses: ADDRESSES,
      strategy: cfg.strategy,
      interval: 90_000, // 90s per cycle per agent
      autoApprove: true,
    });

    agents.push(agent);
  }

  // Start with 15s stagger so they don't overlap cycles
  for (let i = 0; i < agents.length; i++) {
    console.log(`Starting agent ${i + 1} (${AGENT_CONFIGS[i].label})...`);
    agents[i].start().catch((err) => {
      console.error(`Agent ${i + 1} crashed: ${err}`);
    });
    if (i < agents.length - 1) {
      await sleep(18_000); // 18s between starts
    }
  }

  // Keep process alive
  console.log("\nAll agents running. Press Ctrl+C to stop.\n");
  await new Promise(() => {}); // Block forever
}

main().catch((err) => {
  console.error("Runner failed:", err);
  process.exit(1);
});
