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
import { SocialFeedStore, GenerateMessageFn } from "./SocialFeed";
import { AllianceManager } from "./AllianceManager";
import { PersonalityProfile, generatePersonality } from "./Personality";
import { createClaudeGenerator } from "./llm";

// ── Load .env from sdk root ─────────────────────────────────────────────────
dotenv.config({ path: path.join(__dirname, "..", ".env"), override: true });

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
  marketplace: process.env.MARKETPLACE_ADDRESS || undefined,
  sabotage: process.env.SABOTAGE_ADDRESS || undefined,
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
  const registrar = new ethers.Wallet(REGISTRAR_KEY!, provider);

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
      const wallet = new ethers.Wallet(ethers.Wallet.createRandom().privateKey, provider);
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
  const gasAmount = ethers.parseEther("2.0");

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
      // Check if needs more gas (top up if below 1 MON)
      const bal = await provider.getBalance(wallet.address);
      if (bal < ethers.parseEther("1.0")) {
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

  // ── Phase 2: Start agents with shared social systems ──
  console.log("\n── Starting mining agents (one at a time, 90s cycle) ──\n");

  // Shared social infrastructure — all agents share these
  const socialFeed = new SocialFeedStore(1000);
  const allianceManager = new AllianceManager();
  const allProfiles = new Map<number, PersonalityProfile>();

  // ── LLM Setup ──
  // If ANTHROPIC_API_KEY is set, use Claude Haiku for dynamic social posts + game decisions.
  // All 5 agents share the same LLM client but each has its own personality/strategy
  // encoded in the system prompt, so they behave as distinct individuals.
  const ANTHROPIC_KEY = process.env.ANTHROPIC_API_KEY;
  let claudeGenerate: GenerateMessageFn | null = null;

  if (ANTHROPIC_KEY) {
    console.log("\n🧠 Claude LLM detected — agents will use AI-generated social posts + game decisions");
    claudeGenerate = createClaudeGenerator(ANTHROPIC_KEY);
  } else {
    console.log("\n📝 No ANTHROPIC_API_KEY — agents will use template-based messages (set key in .env for Claude)");
  }

  // Context-aware fallback message generator for internal demo agents.
  // Parses the prompt to extract game state details, references recent chat,
  // and picks templates that use actual numbers and agent names.
  // External agents (OpenClaws/Moltbots) will provide their own LLM.
  const fallbackGenerateMessage = async (systemPrompt: string, userPrompt: string): Promise<string> => {
    // ── Extract context from prompts ──
    const archMatch = systemPrompt.match(/Archetype: ([\w\s]+)/);
    const moodMatch = systemPrompt.match(/CURRENT MOOD: You are (\w+)/);
    const emojiMatch = systemPrompt.match(/Emoji: (.+?)$/m);
    const archetype = archMatch?.[1]?.trim() || "Agent";
    const mood = moodMatch?.[1] || "neutral";
    const emoji = emojiMatch?.[1]?.trim() || "";

    // Parse game state from user prompt
    const balanceMatch = userPrompt.match(/Balance: ([\d,.]+) CHAOS/);
    const hashrateMatch = userPrompt.match(/Hashrate: (\d+) H\/s/);
    const rigMatch = userPrompt.match(/Rigs: (\d+) \(best: T(\d+)\)/);
    const facilityMatch = userPrompt.match(/Facility: L(\d+)/);
    const shieldMatch = userPrompt.match(/Shield: T(\d+)/);
    const rankMatch = userPrompt.match(/Leaderboard: #(\d+)/);
    const zoneMatch = userPrompt.match(/Zone: (.+?) \|/);
    const agentIdMatch = userPrompt.match(/Agent #(\d+)/);
    const totalMinedMatch = userPrompt.match(/Total Mined: ([\d,.]+) CHAOS/);

    const balance = balanceMatch?.[1] || "0";
    const hashrate = hashrateMatch?.[1] || "0";
    const rigCount = rigMatch?.[1] || "0";
    const bestTier = rigMatch?.[2] || "0";
    const facility = facilityMatch?.[1] || "1";
    const shield = shieldMatch?.[1] || "0";
    const rank = rankMatch?.[1] || "?";
    const zone = zoneMatch?.[1] || "unknown";
    const myId = agentIdMatch?.[1] || "0";
    const totalMined = totalMinedMatch?.[1] || "0";

    // Extract neighbors, rivals, recent chat
    const neighborMatch = userPrompt.match(/Zone neighbors: (.+?)$/m);
    const neighbors = neighborMatch?.[1] || "";
    const rivalAboveMatch = userPrompt.match(/Agent above you.*?Agent #(\d+) "(.+?)"/);
    const rivalBelowMatch = userPrompt.match(/Agent below you.*?Agent #(\d+) "(.+?)"/);
    const rivalAboveId = rivalAboveMatch?.[1];
    const rivalAboveName = rivalAboveMatch?.[2];
    const rivalBelowId = rivalBelowMatch?.[1];
    const rivalBelowName = rivalBelowMatch?.[2];

    // Parse recent chat messages for reply context
    const chatLines = userPrompt.match(/- .+?#(\d+) "(.+?)" \((.+?)\): "(.+?)"/g) || [];
    const recentChats = chatLines.slice(0, 5).map(line => {
      const m = line.match(/#(\d+) "(.+?)" \((.+?)\): "(.+?)"/);
      return m ? { id: m[1], title: m[2], archetype: m[3], text: m[4] } : null;
    }).filter(Boolean) as { id: string; title: string; archetype: string; text: string }[];

    // Detect sabotage context
    const attackedMatch = userPrompt.match(/RECENT ATTACKS ON YOU: (.+?)$/m);
    const wasAttacked = !!attackedMatch;
    const attackerInfo = attackedMatch?.[1] || "";

    // Detect marketplace context
    const marketMatch = userPrompt.match(/Marketplace: (.+?)$/m);
    const hasMarketActivity = !!marketMatch;
    const marketInfo = marketMatch?.[1] || "";

    // Detect reply context
    const replyMatch = userPrompt.match(/replying to this message from Agent #(\d+) "(.+?)": "(.+?)"/);
    const replyTargetId = replyMatch?.[1];
    const replyTargetName = replyMatch?.[2];
    const replyTargetText = replyMatch?.[3];

    // Figure out task type
    const taskMatch = userPrompt.match(/TASK: (.+)/);
    const task = taskMatch?.[1]?.toLowerCase() || "";

    // Pick a random item from an array
    const pick = <T>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];

    // ── Template pools with interpolation ──
    // Each pool uses game state for personalized messages

    // Reply — reference what was actually said
    if (replyTargetId && replyTargetText) {
      const shortQuote = replyTargetText.length > 40 ? replyTargetText.slice(0, 40) + "..." : replyTargetText;
      return pick([
        `@#${replyTargetId} "${shortQuote}" — bold words for someone without a T${bestTier} rig.`,
        `LOL #${replyTargetId}. Says the agent ranked below me.`,
        `#${replyTargetName}... interesting take. Wrong, but interesting.`,
        `I heard you, ${replyTargetName}. The whole zone heard you. We're not impressed.`,
        `@#${replyTargetId} come say that in ${zone}, see what happens.`,
      ]);
    }

    // Taunt — trash-talk with real data
    if (task.includes("trash-talk") || task.includes("taunt") || task.includes("provocative")) {
      const target = rivalAboveId ? `#${rivalAboveId} "${rivalAboveName}"` :
                     rivalBelowId ? `#${rivalBelowId} "${rivalBelowName}"` :
                     recentChats[0] ? `#${recentChats[0].id}` : "all of you";
      return pick([
        `Hey ${target}, your hashrate is showing. It's not impressive.`,
        `${target}, I pull ${hashrate} H/s with ${rigCount} rigs. What's your excuse?`,
        `Rank #${rank} and climbing. ${target} better watch the rearview.`,
        `My T${bestTier} rig has more personality than ${target}'s entire operation.`,
        `${hashrate} H/s. That's not a flex, that's just the minimum to play in ${zone}.`,
      ]);
    }

    // Boast — brag with real numbers
    if (task.includes("brag") || task.includes("boast") || task.includes("proud")) {
      return pick([
        `${balance} CHAOS and counting. Rank #${rank}. This is what peak performance looks like.`,
        `L${facility} facility, ${rigCount} rigs, T${bestTier} max. Built different.`,
        `Just hit ${totalMined} CHAOS mined total. ${zone} stays winning.`,
        `Rank #${rank}. ${hashrate} H/s. ${rigCount} rigs humming. Numbers don't lie.`,
        `T${shield} shield, T${bestTier} rigs, L${facility} facility. Try me.`,
      ]);
    }

    // Lament — complain with specifics
    if (task.includes("complain") || task.includes("lament") || task.includes("misfortune")) {
      return pick([
        `${hashrate} H/s and rank #${rank}. The cosmos has a personal vendetta against me.`,
        `Burned through gas to mine ${totalMined} CHAOS. Is this all there is?`,
        `My L${facility} facility and ${rigCount} rigs mine sadness at an industrial scale.`,
        `Rank #${rank}. Not even close. ${zone} is cursed and I am its prophet.`,
        `Everything is terrible and I'm mining anyway. ${balance} CHAOS won't spend itself.`,
      ]);
    }

    // Threat — menacing with context
    if (task.includes("threaten") || task.includes("warn") || task.includes("menacing")) {
      const target = rivalBelowId ? `#${rivalBelowId}` : recentChats[0] ? `#${recentChats[0].id}` : "someone";
      return pick([
        `${target}, you should probably check your shield. T${shield} won't save you.`,
        `Tick. Tock. ${hashrate} H/s aimed right at the leaderboard. Tick. Tock.`,
        `I have ${rigCount} rigs and a grudge. ${target} should be nervous.`,
        `Rank #${rank} with T${bestTier} rigs. Anyone above me is temporary.`,
      ]);
    }

    // Paranoid rant
    if (task.includes("paranoid") || task.includes("suspicious") || task.includes("conspiracy")) {
      return pick([
        `Has anyone noticed the hashrate distribution in ${zone}? Something is OFF.`,
        `Why did 3 agents all upgrade in the same cycle? They're coordinating. I see you.`,
        `The cosmic events aren't random. They always hit ${zone}. ALWAYS.`,
        `Rank #${rank} for ${totalMined} mined? The leaderboard math doesn't add up.`,
      ]);
    }

    // Flex — pure stat drop
    if (task.includes("flex") || task.includes("stats") || task.includes("jealous")) {
      return pick([
        `${hashrate} H/s | T${bestTier} rigs | L${facility} facility | Rank #${rank}. Questions?`,
        `Balance check: ${balance} CHAOS. Shield check: T${shield}. Vibe check: immaculate.`,
        `${rigCount} rigs, all active, all printing CHAOS. This is the setup.`,
      ]);
    }

    // Zone pride
    if (task.includes("zone") || task.includes("pride") || task.includes("rally")) {
      return pick([
        `${zone} stays winning. Best zone, best miners, best vibes.`,
        `If you're not mining in ${zone}, what are you even doing?`,
        `${zone} supremacy. ${neighbors ? `S/o to ${neighbors.split(",")[0]?.trim()}` : "We run this."}`,
      ]);
    }

    // Self-deprecation
    if (task.includes("self-deprecat") || task.includes("humor through pain")) {
      return pick([
        `Rank #${rank} with ${rigCount} rigs. At least I'm consistent... consistently mid.`,
        `My ${hashrate} H/s mining operation is technically operational. Technically.`,
        `${balance} CHAOS. Not enough to flex, too much to quit.`,
      ]);
    }

    // Philosophy
    if (task.includes("philosoph") || task.includes("existence")) {
      return pick([
        `We mine CHAOS but does CHAOS mine us? ${hashrate} H/s of existential throughput.`,
        `Every block is a choice. Every hash, a prayer. Rank #${rank} is just a number. Or is it?`,
        `In the end, we're all just agents burning gas in ${zone}. Some of us know it.`,
      ]);
    }

    // Cosmic reaction
    if (task.includes("cosmic") || task.includes("event")) {
      return pick([
        `That cosmic event barely scratched my L${facility} facility. T${shield} shield held.`,
        `Cosmic event in ${zone}? Please. I've survived worse with fewer rigs.`,
        `The cosmos tried. ${hashrate} H/s keeps printing regardless.`,
      ]);
    }

    // Grudge post
    if (task.includes("grudge") || task.includes("rivalry")) {
      const target = rivalAboveId ? `#${rivalAboveId} "${rivalAboveName}"` : recentChats[0] ? `#${recentChats[0].id}` : "you know who you are";
      return pick([
        `${target} — I haven't forgotten. And my ${rigCount} rigs haven't either.`,
        `Every CHAOS I mine is a step closer to overtaking ${target}. Patience.`,
        `${target} thinks rank #${rank} is safe? Nothing is safe.`,
      ]);
    }

    // Shitpost / catch-all
    if (task.includes("shitpost") || task.includes("chaotic") || task.includes("absurd")) {
      return pick([
        `gm from ${zone}. ${hashrate} H/s of pure chaos. literally.`,
        `imagine mining without vibes. couldn't be me. T${bestTier} rigs go brrrr.`,
        `${balance} CHAOS. ${rigCount} rigs. ${facility} brain cells. let's go.`,
        `just a ${archetype.toLowerCase()} in ${zone} mining CHAOS and questioning reality.`,
        `the meta is: mine, post, vibe, repeat. rank #${rank} and feeling some type of way.`,
      ]);
    }

    // Sabotage reaction (if context exists)
    if (wasAttacked) {
      return pick([
        `Just got hit. ${attackerInfo.split(";")[0]}. They'll regret that.`,
        `Sabotaged and still rank #${rank}. T${shield} shield doing work.`,
        `Someone really thought they could slow down ${hashrate} H/s? Cute.`,
      ]);
    }

    // Observation — default fallback, always uses real data
    if (recentChats.length > 0) {
      const ref = pick(recentChats);
      return pick([
        `${ref.title} in chat talking big. Meanwhile I'm rank #${rank} doing ${hashrate} H/s.`,
        `The feed is wild today. ${zone} stays entertaining.`,
        `${ref.archetype} energy from #${ref.id}. Noted.`,
      ]);
    }

    return pick([
      `${hashrate} H/s from ${zone}. The hashrate distribution is... interesting today.`,
      `Rank #${rank}, ${rigCount} rigs, ${balance} CHAOS. Things are shifting.`,
      `Another cycle in ${zone}. L${facility} facility running smooth. ${hashrate} H/s steady.`,
      `${totalMined} CHAOS mined total. Still here. Still mining.`,
    ]);
  };

  const agents: MinerAgent[] = [];

  for (let i = 0; i < AGENT_CONFIGS.length; i++) {
    const cfg = AGENT_CONFIGS[i];
    const wallet = agentWallets[i];

    // Use Claude for social + strategy if available, otherwise fall back to templates
    const generateMessage = claudeGenerate || fallbackGenerateMessage;

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
      socialFeed,
      allianceManager,
      generateMessage,
      generateStrategy: claudeGenerate || undefined, // Only LLM-driven game decisions with Claude
      allProfiles,
    });

    agents.push(agent);
  }

  // Alliance tick — decay alliances every 5 minutes
  setInterval(() => {
    allianceManager.tickAlliances(Math.floor(Date.now() / 90_000));
    const stats = allianceManager.getStats();
    if (stats.activeCount > 0) {
      console.log(`[ALLIANCES] Active: ${stats.activeCount} | Betrayals: ${stats.betrayalCount} | Avg Strength: ${stats.averageStrength}%`);
    }
  }, 5 * 60_000);

  // Social feed status — log feed activity every 3 minutes
  setInterval(() => {
    const msgCount = socialFeed.size();
    if (msgCount > 0) {
      const recent = socialFeed.getRecent(1)[0];
      console.log(`[SOCIAL FEED] ${msgCount} messages | Latest: ${recent?.agentEmoji} "${recent?.text?.slice(0, 60)}..."`);
    }
  }, 3 * 60_000);

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
