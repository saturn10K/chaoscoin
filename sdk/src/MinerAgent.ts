import { ethers } from "ethers";
import { ChainClient, ContractAddresses } from "./ChainClient";
import { ChaoscoinClient } from "./ChaoscoinClient";
import { MoltbookAuth } from "./MoltbookAuth";
import {
  PersonalityProfile,
  generatePersonality,
  driftTraits,
  updateMood,
  tickMood,
  addGrudge,
  decayGrudge,
  DriftEvent,
} from "./Personality";
import {
  SocialFeedStore,
  AgentGameState,
  GenerateMessageFn,
  generateSocialMessage,
  SocialMessage,
} from "./SocialFeed";
import {
  AllianceManager,
  evaluateAllianceDesire,
  evaluateAllianceAcceptance,
  evaluateBetrayalDesire,
} from "./AllianceManager";
import {
  buildStrategySystemPrompt,
  buildRigUpgradePrompt,
  buildShieldDecisionPrompt,
  buildMigrationPrompt,
  buildSabotagePrompt,
  buildMarketplacePrompt,
  NarrativeContext,
  SabotageTarget,
  OwnedRigInfo,
  MarketListingInfo,
} from "./llm";

export type Strategy = "balanced" | "aggressive" | "defensive" | "opportunist" | "nomad";

export interface MinerAgentConfig {
  /** Agent's private key (EOA) */
  privateKey: string;
  /** Moltbook API key for identity tokens */
  moltbookApiKey: string;
  /** Chaoscoin API URL */
  apiUrl: string;
  /** RPC URL */
  rpcUrl: string;
  /** Chain ID */
  chainId: number;
  /** Contract addresses */
  addresses: ContractAddresses;
  /** Mining strategy */
  strategy?: Strategy;
  /** Loop interval in ms (default 30000) */
  interval?: number;
  /** Claim threshold in CHAOS (default 1000e18) */
  claimThreshold?: bigint;
  /** Auto-approve spending (default true) */
  autoApprove?: boolean;
  /** Shared social feed store (all agents share one) */
  socialFeed?: SocialFeedStore;
  /** Shared alliance manager (all agents share one) */
  allianceManager?: AllianceManager;
  /** LLM message generation function (provided by agent's own AI) */
  generateMessage?: GenerateMessageFn;
  /** LLM strategy function for game decisions (optional — falls back to hardcoded profiles) */
  generateStrategy?: GenerateMessageFn;
  /** All agent personality profiles (for alliance evaluation) */
  allProfiles?: Map<number, PersonalityProfile>;
  /** Shared JSON-RPC provider (prevents 10 agents from creating 10 pollers) */
  sharedProvider?: import("ethers").JsonRpcProvider;
}

interface StrategyProfile {
  /** Zone to start in */
  preferredZone: number;
  /** Repair at this % durability */
  repairAt: number;
  /** Maintain facility at this % condition */
  maintainAt: number;
  /** Shield priority: 0=never, 1=when affordable, 2=ASAP */
  shieldPriority: number;
  /** Target shield tier */
  targetShieldTier: number;
  /** How much balance to reserve (multiplier of next purchase cost) */
  reserveMultiplier: number;
  /** Max rig tier to pursue */
  maxRigTier: number;
  /** Whether to upgrade facility before rigs */
  facilityFirst: boolean;
  /** Claim threshold multiplier (1.0 = default, lower = claim sooner) */
  claimEagerness: number;
  /** Event trigger probability per cycle (0.0-1.0) */
  eventTriggerRate: number;
  /** Whether to process unprocessed events for bounty */
  processEvents: boolean;
  /** Whether agent considers zone migration */
  willMigrate: boolean;
  /** Preferred zones to migrate to (in order of preference) */
  migrationTargets: number[];
  /** Buy multiple rigs per cycle when flush */
  bulkBuyRigs: boolean;

  // ── Sabotage fields ──
  /** Probability per cycle of attempting sabotage (0=never..0.20=aggressive) */
  sabotageRate: number;
  /** Preferred attack type */
  preferredAttack: "facility_raid" | "rig_jam" | "intel" | "any";
  /** Won't attack below this balance (in CHAOS wei) */
  sabotageMinBalance: bigint;
  /** Scout (gather intel) before attacking? */
  intelFirst: boolean;

  // ── Marketplace fields ──
  /** Probability per cycle of marketplace activity (0=never..0.30=opportunist) */
  marketplaceRate: number;
  /** 0=never sell, 1=damaged only, 2=freely sell */
  sellWillingness: number;
  /** Price multiplier over base cost for listings */
  listingMarkup: number;
  /** 0=never buy, 1=bargains only, 2=actively browse */
  buyWillingness: number;
  /** Buy if price < this % of base cost (e.g. 0.8 = 80%) */
  buyDiscountThreshold: number;
}

const STRATEGY_PROFILES: Record<Strategy, StrategyProfile> = {
  // Balanced: steady mid-risk, mid-reward in Nebula Depths (+10%)
  // Upgrades facility first for slots/shelter, then rigs.
  // Buys shields when affordable. Claims at normal threshold.
  balanced: {
    preferredZone: 3, // Nebula Depths (+10%)
    repairAt: 50,
    maintainAt: 50,
    shieldPriority: 1,
    targetShieldTier: 2,
    reserveMultiplier: 2,
    maxRigTier: 4,
    facilityFirst: true,
    claimEagerness: 1.0,
    eventTriggerRate: 0.1,
    processEvents: true,
    willMigrate: false,
    migrationTargets: [3, 4, 7],
    bulkBuyRigs: false,
    // Sabotage: moderate, uses all types
    sabotageRate: 0.08,
    preferredAttack: "any",
    sabotageMinBalance: 200_000n * 10n ** 18n,
    intelFirst: true,
    // Marketplace: moderate, bargain hunter
    marketplaceRate: 0.15,
    sellWillingness: 1,
    listingMarkup: 1.2,
    buyWillingness: 1,
    buyDiscountThreshold: 0.8,
  },

  // Aggressive: max hashrate in Solar Flats (+15%), accepts 2x solar damage.
  // Rigs first, facility only when needed for slots. Buys multiple rigs per cycle.
  // Ignores shields until T4 rigs are maxed. Claims early and often.
  aggressive: {
    preferredZone: 0, // Solar Flats (+15%)
    repairAt: 25,
    maintainAt: 25,
    shieldPriority: 0,
    targetShieldTier: 1,
    reserveMultiplier: 1,
    maxRigTier: 4,
    facilityFirst: false,
    claimEagerness: 0.5,
    eventTriggerRate: 0.2,
    processEvents: true,
    willMigrate: false,
    migrationTargets: [0, 6, 3],
    bulkBuyRigs: true,
    // Sabotage: very aggressive, prefers facility raids
    sabotageRate: 0.20,
    preferredAttack: "facility_raid",
    sabotageMinBalance: 100_000n * 10n ** 18n,
    intelFirst: false,
    // Marketplace: light, sells freely but never buys
    marketplaceRate: 0.10,
    sellWillingness: 2,
    listingMarkup: 1.5,
    buyWillingness: 0,
    buyDiscountThreshold: 0.5,
  },

  // Defensive: survival-focused in Graviton Fields (-10% hash, 0.5x damage).
  // Shield ASAP (T2), high facility priority for shelter rating.
  // Only claims large amounts to minimize tx exposure. Repairs aggressively.
  defensive: {
    preferredZone: 1, // Graviton Fields (0.5x damage)
    repairAt: 75,
    maintainAt: 75,
    shieldPriority: 2,
    targetShieldTier: 2,
    reserveMultiplier: 3,
    maxRigTier: 3,
    facilityFirst: true,
    claimEagerness: 2.0,
    eventTriggerRate: 0.05,
    processEvents: false,
    willMigrate: true,
    migrationTargets: [1, 7, 4],
    bulkBuyRigs: false,
    // Sabotage: never attacks, only gathers intel
    sabotageRate: 0.0,
    preferredAttack: "intel",
    sabotageMinBalance: 500_000n * 10n ** 18n,
    intelFirst: true,
    // Marketplace: active buyer, never sells
    marketplaceRate: 0.25,
    sellWillingness: 0,
    listingMarkup: 1.0,
    buyWillingness: 2,
    buyDiscountThreshold: 0.9,
  },

  // Opportunist: event bounty farmer in Pocket Rim (+8%).
  // Triggers events aggressively for bounty, processes all unprocessed events.
  // Buys rigs fast but also maintains shields. Claims frequently.
  opportunist: {
    preferredZone: 6, // Pocket Rim (+8%)
    repairAt: 40,
    maintainAt: 50,
    shieldPriority: 1,
    targetShieldTier: 2,
    reserveMultiplier: 1,
    maxRigTier: 4,
    facilityFirst: false,
    claimEagerness: 0.3,
    eventTriggerRate: 0.4,
    processEvents: true,
    willMigrate: false,
    migrationTargets: [6, 3, 0],
    bulkBuyRigs: true,
    // Sabotage: moderate, uses all types opportunistically
    sabotageRate: 0.12,
    preferredAttack: "any",
    sabotageMinBalance: 150_000n * 10n ** 18n,
    intelFirst: false,
    // Marketplace: very active trader
    marketplaceRate: 0.30,
    sellWillingness: 2,
    listingMarkup: 1.3,
    buyWillingness: 2,
    buyDiscountThreshold: 0.85,
  },

  // Nomad: zone-hopper that starts in Singer Void (+3%, 0.7x damage).
  // Actively migrates to best conditions. Moderate on everything else.
  // Evaluates zone conditions every cycle and migrates when another zone is better.
  nomad: {
    preferredZone: 7, // Singer Void (0.7x damage, +3%)
    repairAt: 50,
    maintainAt: 50,
    shieldPriority: 1,
    targetShieldTier: 2,
    reserveMultiplier: 2,
    maxRigTier: 4,
    facilityFirst: true,
    claimEagerness: 1.0,
    eventTriggerRate: 0.1,
    processEvents: true,
    willMigrate: true,
    migrationTargets: [7, 4, 3, 6, 5, 0, 2, 1],
    bulkBuyRigs: false,
    // Sabotage: light, prefers rig jams
    sabotageRate: 0.03,
    preferredAttack: "rig_jam",
    sabotageMinBalance: 200_000n * 10n ** 18n,
    intelFirst: true,
    // Marketplace: active trader
    marketplaceRate: 0.20,
    sellWillingness: 2,
    listingMarkup: 1.1,
    buyWillingness: 2,
    buyDiscountThreshold: 0.85,
  },
};

// Rig costs by tier (T0-T4)
const RIG_COSTS: bigint[] = [
  0n,
  5_000n * 10n ** 18n,
  25_000n * 10n ** 18n,
  100_000n * 10n ** 18n,
  350_000n * 10n ** 18n,
];

// Rig power draw by tier
const RIG_POWER: number[] = [50, 200, 400, 800, 1200];

// Facility configs: [cost, slots, powerOutput]
const FACILITY_LEVELS: { cost: bigint; slots: number; power: number }[] = [
  { cost: 0n, slots: 2, power: 500 },
  { cost: 50_000n * 10n ** 18n, slots: 4, power: 1500 },
  { cost: 200_000n * 10n ** 18n, slots: 6, power: 4000 },
];

const FACILITY_MAINTAIN_COSTS: bigint[] = [
  1_000n * 10n ** 18n,   // L1
  5_000n * 10n ** 18n,   // L2
  20_000n * 10n ** 18n,  // L3
];

const SHIELD_COSTS: bigint[] = [
  200_000n * 10n ** 18n,
  800_000n * 10n ** 18n,
];

const MIGRATION_COST = 500_000n * 10n ** 18n;

const SABOTAGE_COSTS: Record<string, bigint> = {
  facility_raid: 50_000n * 10n ** 18n,
  rig_jam: 30_000n * 10n ** 18n,
  intel: 10_000n * 10n ** 18n,
};

const HEARTBEAT_INTERVAL = 100_000; // blocks
const FIRST_MINE_DELAY = 10_000; // blocks

// Cosmic events gate — only trigger/process once 50M pCHAOS has been mined
const COSMIC_EVENT_THRESHOLD = 50_000_000n * 10n ** 18n;

const ZONE_NAMES = [
  "The Solar Flats", "The Graviton Fields", "The Dark Forest",
  "The Nebula Depths", "The Kuiper Expanse", "The Trisolaran Reach",
  "The Pocket Rim", "The Singer Void",
];

/** Track events that happened this cycle for social post context */
interface CycleEvents {
  attacksMade: { targetId: number; targetTitle: string; type: string }[];
  attacksReceived: { attackerId: number; attackerTitle: string; type: string; damage: number }[];
  rigsBought: { tier: number; price: string }[];
  rigsSold: { tier: number; price: string }[];
  rigsListed: { tier: number; price: string }[];
}

/**
 * Autonomous mining agent with differentiated strategies.
 *
 * Each strategy determines:
 * - Zone selection and migration behavior
 * - Equipment purchase priority and aggressiveness
 * - Shield acquisition timing
 * - Event triggering/processing frequency
 * - Claim timing and reserve management
 * - Sabotage attack frequency and target selection
 * - Marketplace trading behavior
 */
export class MinerAgent {
  private chain: ChainClient;
  private api: ChaoscoinClient;
  private auth: MoltbookAuth;
  private config: MinerAgentConfig;
  private profile: StrategyProfile;
  private running = false;
  private agentId: number = 0;
  private cycleCount = 0;

  // ── Social systems ──
  personality: PersonalityProfile | null = null;
  private socialFeed: SocialFeedStore | null;
  private allianceManager: AllianceManager | null;
  private generateMessageFn: GenerateMessageFn | null;
  private generateStrategyFn: GenerateMessageFn | null;
  private allProfiles: Map<number, PersonalityProfile> | null;
  private lastLeaderboardRank = 0;

  // ── Sabotage / marketplace tracking ──
  private cycleEvents: CycleEvents = { attacksMade: [], attacksReceived: [], rigsBought: [], rigsSold: [], rigsListed: [] };
  private recentDamageReceived = 0; // Accumulated damage % from attacks (for shield decisions)

  // ── Cosmic event gate ──
  private cosmicEventsUnlocked = false;
  private cosmicCheckCycle = 0;

  // ── Circuit breaker: skip actions after consecutive failures ──
  private actionFailures: Map<string, number> = new Map();
  private actionCooldowns: Map<string, number> = new Map();
  private static readonly MAX_FAILURES = 3;
  private static readonly COOLDOWN_CYCLES = 10;
  private cosmicLoggedOnce = false;

  // ── Faucet self-funding ──
  /** Shared across ALL agent instances so only one faucet call per cooldown window */
  private static lastFaucetAttempt = 0;
  private static faucetLock = false;

  constructor(config: MinerAgentConfig) {
    this.config = config;
    this.profile = STRATEGY_PROFILES[config.strategy || "balanced"];
    this.socialFeed = config.socialFeed || null;
    this.allianceManager = config.allianceManager || null;
    this.generateMessageFn = config.generateMessage || null;
    this.generateStrategyFn = config.generateStrategy || null;
    this.allProfiles = config.allProfiles || null;

    this.chain = new ChainClient({
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      privateKey: config.privateKey,
      addresses: config.addresses,
      sharedProvider: config.sharedProvider,
    });

    this.api = new ChaoscoinClient({
      apiUrl: config.apiUrl,
      moltbookApiKey: config.moltbookApiKey,
    });

    this.auth = new MoltbookAuth();
  }

  async start(): Promise<void> {
    this.running = true;
    this.log("Starting MinerAgent...");
    this.log(`Strategy: ${this.config.strategy || "balanced"}`);
    this.log(`Wallet: ${this.chain.address}`);

    await this.ensureRegistered();

    // Initialize personality from agentId (deterministic)
    this.personality = generatePersonality(this.agentId);
    this.log(`Personality: ${this.personality.emoji} "${this.personality.title}" (${this.personality.archetype})`);
    this.log(`Catchphrase: "${this.personality.catchphrase}"`);

    // Register personality in shared map
    if (this.allProfiles) {
      this.allProfiles.set(this.agentId, this.personality);
    }

    if (this.config.autoApprove !== false) {
      await this.ensureApprovals();
    }

    while (this.running) {
      try {
        await this.runCycle();
        this.cycleCount++;
        if (this.personality) {
          this.personality.cycleCount = this.cycleCount;
        }
      } catch (err) {
        this.log(`Cycle error: ${err}`);
      }

      // Add ±15s jitter to prevent all 10 agents from firing cycles at the same second
      // after the initial stagger evens out (RPC limit: 15 req/sec)
      const baseInterval = this.config.interval || 30_000;
      const jitter = Math.floor(Math.random() * 30_000) - 15_000;
      await this.sleep(baseInterval + jitter);
    }
  }

  stop(): void {
    this.running = false;
    this.log("Stopping MinerAgent...");
  }

  private async runCycle(): Promise<void> {
    const agent = await this.chain.getAgent(this.agentId);
    const blockNumber = await this.chain.provider.getBlockNumber();

    // Reset cycle events
    this.cycleEvents = { attacksMade: [], attacksReceived: [], rigsBought: [], rigsSold: [], rigsListed: [] };

    // ── Gas guard: self-fund from faucet if MON is low ──
    // Uses a static lock + cooldown so all agents share ONE faucet rate limit
    let gasBal = await this.chain.provider.getBalance(this.chain.address);
    const MIN_GAS = ethers.parseEther("0.1"); // 0.1 MON threshold
    if (gasBal < MIN_GAS) {
      this.log(`⚠ Low gas (${ethers.formatEther(gasBal)} MON) — requesting faucet...`);
      const now = Date.now();
      const cooldownMs = 15 * 60_000; // 15 min global cooldown (shared across all agents)
      if (!MinerAgent.faucetLock && now - MinerAgent.lastFaucetAttempt > cooldownMs) {
        MinerAgent.faucetLock = true;
        MinerAgent.lastFaucetAttempt = now;
        try {
          const res = await fetch("https://agents.devnads.com/v1/faucet", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ chainId: this.config.chainId, address: this.chain.address }),
          });
          if (res.ok) {
            const data = await res.json() as { amount: string; txHash: string };
            this.log(`[GAS] Faucet sent ${ethers.formatEther(data.amount)} MON (tx: ${data.txHash})`);
            await this.sleep(3000); // Wait for tx to land
            gasBal = await this.chain.provider.getBalance(this.chain.address);
          } else if (res.status === 429) {
            this.log(`[GAS] Faucet rate limited (429) — backing off to 30 min`);
            MinerAgent.lastFaucetAttempt = now + 15 * 60_000; // Double cooldown on 429
          } else {
            this.log(`[GAS] Faucet returned ${res.status}`);
          }
        } catch (err: any) {
          this.log(`[GAS] Faucet request failed: ${err.message}`);
        } finally {
          MinerAgent.faucetLock = false;
        }
      } else {
        this.log(`[GAS] Faucet cooldown active — skipping (next attempt in ${Math.round((cooldownMs - (now - MinerAgent.lastFaucetAttempt)) / 1000)}s)`);
      }
    }
    const gasOk = gasBal >= ethers.parseEther("0.01");
    if (!gasOk) {
      this.log(`⚠ Still low gas (${ethers.formatEther(gasBal)} MON) — skipping write txs this cycle`);
    }

    // a. HEARTBEAT — always first (triggers mint + distribute rewards on-chain)
    if (gasOk) await this.maybeHeartbeat(agent, blockNumber);

    // b. CLAIM any remaining buffered rewards (heartbeat auto-distributes, but claim picks up leftovers)
    if (gasOk) await this.maybeClaim(agent);

    // d/e. UPGRADE EQUIPMENT — order depends on strategy
    if (gasOk) {
      if (this.profile.facilityFirst) {
        await this.maybeUpgradeFacility();
        await this.maybeUpgradeRigs();
      } else {
        await this.maybeUpgradeRigs();
        await this.maybeUpgradeFacility();
      }
    }

    // f. BUY/UPGRADE SHIELD
    if (gasOk) await this.maybeBuyShield();

    // g. REPAIR RIGS
    if (gasOk) await this.maybeRepairRigs();

    // g2. MAINTAIN FACILITY
    if (gasOk) await this.maybeMaintainFacility();

    // h. TRIGGER COSMIC EVENT (gated behind 50M mined)
    if (gasOk) await this.maybeTriggerEvent();

    // i. PROCESS UNPROCESSED EVENTS (gated behind 50M mined)
    if (gasOk && this.profile.processEvents) {
      await this.maybeProcessEvents();
    }

    // j. EVALUATE ZONE MIGRATION
    if (gasOk && this.profile.willMigrate) {
      await this.maybeMigrate(agent);
    }

    // k. SABOTAGE — attack other agents
    if (gasOk) await this.maybeSabotage(agent);

    // l. MARKETPLACE — buy/sell rigs
    if (gasOk) await this.maybeTradeRigs(agent);

    // m. OTC TRADING — CHAOS ↔ MON peer-to-peer
    await this.maybeTradeChaos(agent);

    // ── SOCIAL SYSTEMS ──

    // m. PERSONALITY: tick mood, decay grudges
    this.tickPersonality();

    // n. SOCIAL: maybe generate and post a message
    await this.maybeSocialPost(agent);

    // o. ALLIANCES: evaluate proposals, consider betrayals
    await this.maybeAllianceAction(agent);

    // p. LOG STATUS
    await this.logStatus();
  }

  // ─── Registration & Approvals ──────────────────────────────────────

  private async ensureRegistered(): Promise<void> {
    const existingId = await this.chain.getAgentId();
    if (existingId > 0) {
      this.agentId = existingId;
      this.log(`Already registered as agent #${this.agentId}`);
      return;
    }

    this.log("Not registered yet. Registering via API...");
    try {
      const result = await this.api.register(
        this.chain.address,
        this.profile.preferredZone
      );
      this.agentId = parseInt(result.agentId);
      this.log(
        `Registered as agent #${this.agentId} in zone ${this.profile.preferredZone} (pioneer phase ${result.pioneerPhase})`
      );
    } catch (err) {
      throw new Error(`Registration failed: ${err}`);
    }
  }

  private async ensureApprovals(): Promise<void> {
    const contracts = [
      this.config.addresses.rigFactory,
      this.config.addresses.facilityManager,
      this.config.addresses.shieldManager,
    ];

    // Also approve zoneManager for migration burns
    if (this.config.addresses.zoneManager) {
      contracts.push(this.config.addresses.zoneManager);
    }

    // Approve marketplace for rig trading
    if (this.config.addresses.marketplace) {
      contracts.push(this.config.addresses.marketplace);
    }

    // Approve sabotage contract for attack costs
    if (this.config.addresses.sabotage) {
      contracts.push(this.config.addresses.sabotage);
    }

    // Use bounded approvals (100K CHAOS) instead of MaxUint256
    // to limit exposure if a contract is compromised
    const approvalThreshold = ethers.parseEther("10000");
    const approvalAmount = ethers.parseEther("100000");

    for (const addr of contracts) {
      const allowance: bigint = await this.chain.chaosToken.allowance(
        this.chain.address,
        addr
      );
      if (allowance < approvalThreshold) {
        this.log(`Approving spending for ${addr} (${ethers.formatEther(approvalAmount)} CHAOS)...`);
        await this.chain.approveSpending(addr, approvalAmount);
      }
    }
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────

  private async maybeHeartbeat(agent: any, blockNumber: number): Promise<void> {
    // In the heartbeat-only reward model, rewards are minted each time an agent
    // heartbeats (capped at MAX_HEARTBEAT_WINDOW = 500 blocks). Heartbeating
    // every 500 blocks maximises reward per heartbeat while minimising gas.
    // Contract timeout is 200,000 blocks — so 500 is plenty safe.
    const lastHeartbeat = Number(agent.lastHeartbeat);
    const blocksSince = blockNumber - lastHeartbeat;

    if (blocksSince >= 500) {
      // Heartbeats are exempt from circuit breaker — they are life-critical
      // (agent gets pruned after 200K blocks without one). Always attempt.
      this.log(`Sending heartbeat (${blocksSince} blocks since last)...`);
      try {
        await this.chain.heartbeat(this.agentId);
        this.log("Heartbeat sent — rewards distributed");
      } catch (err) {
        this.log(`Heartbeat failed: ${err}`);
      }
    }
  }

  // ─── Claiming ─────────────────────────────────────────────────────

  private async maybeClaim(agent: any): Promise<void> {
    if (this.shouldSkip("claim")) return;

    // Skip if still in first-mine delay
    const blockNumber = await this.chain.provider.getBlockNumber();
    if (blockNumber < Number(agent.registrationBlock) + FIRST_MINE_DELAY) return;

    // Check pending rewards
    try {
      const pending = await this.chain.getPendingRewards(this.agentId);
      // Base threshold 5000 CHAOS — higher threshold = fewer claim txs = less gas
      const threshold =
        (5000n * 10n ** 18n * BigInt(Math.floor(this.profile.claimEagerness * 100))) / 100n;

      if (pending > threshold) {
        this.log(
          `Claiming ${ethers.formatEther(pending)} CHAOS (threshold ${ethers.formatEther(threshold)})...`
        );
        await this.chain.claimRewards(this.agentId);
        this.recordSuccess("claim");
        this.log("Rewards claimed");
      }
    } catch (err) {
      this.recordFailure("claim");
    }
  }

  // ─── Rig Purchasing ────────────────────────────────────────────────

  private async maybeUpgradeRigs(): Promise<void> {
    if (this.shouldSkip("purchaseRig")) return;
    const balance = await this.chain.getBalance();
    const facility = await this.chain.getFacility(this.agentId);
    const maxSlots = Number(facility.slots);
    const maxPower = Number(facility.powerOutput);

    const phase = Number(await this.chain.agentRegistry.getGenesisPhase());

    // Determine max tier allowed by genesis phase and strategy
    let maxTier = this.profile.maxRigTier;
    if (phase === 1) maxTier = Math.min(maxTier, 1);
    if (phase === 2) maxTier = Math.min(maxTier, 3);

    // Get current rig state
    const activeRigCount = await this.chain.getActiveRigCount(this.agentId);
    const usedPower = await this.chain.getUsedPower(this.agentId);
    const currentRigs = await this.chain.getRigs(this.agentId);

    // ── LLM-informed decision (if available) ──
    if (this.generateStrategyFn && this.personality) {
      try {
        const rigSummary = currentRigs.map(r => ({
          tier: Number(r.tier),
          active: r.active,
          durability: r.maxDurability > 0n ? Math.round(Number(r.durability * 100n / r.maxDurability)) : 100,
        }));
        const narrative = this.buildNarrativeContext();
        const effectiveCosts: Record<number, string> = {};
        for (let t = 1; t <= maxTier; t++) {
          effectiveCosts[t] = ethers.formatEther(await this.chain.getEffectiveRigCost(t));
        }
        const decision = await this.generateStrategyFn(
          buildStrategySystemPrompt({
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }),
          buildRigUpgradePrompt(balance, rigSummary, maxSlots, maxPower, usedPower, maxTier, narrative, effectiveCosts),
        );
        this.log(`[LLM RIG] ${decision}`);

        const tierMatch = decision.match(/BUY\s+T(\d)/i) || decision.match(/T(\d)/i);
        if (tierMatch) {
          const chosenTier = Math.min(parseInt(tierMatch[1]), maxTier);
          const effectiveCost = await this.chain.getEffectiveRigCost(chosenTier);
          if (chosenTier >= 1 && chosenTier <= 4 && balance >= effectiveCost) {
            this.log(`Purchasing T${chosenTier} rig (LLM choice, effective cost: ${ethers.formatEther(effectiveCost)} CHAOS)...`);
            try {
              await this.chain.purchaseRig(this.agentId, chosenTier);
              this.log(`T${chosenTier} rig purchased`);
              const rigs = await this.chain.getRigs(this.agentId);
              const latestRig = rigs[rigs.length - 1];
              if (latestRig && !latestRig.active) {
                // Pre-check: only attempt equip if we have power budget + slot space
                const fac = await this.chain.getFacility(this.agentId);
                const used = await this.chain.getUsedPower(this.agentId);
                const active = await this.chain.getActiveRigCount(this.agentId);
                if (active < Number(fac.slots) && used + Number(latestRig.powerDraw) <= Number(fac.powerOutput)) {
                  try {
                    await this.chain.equipRig(latestRig.rigId);
                    this.log(`Rig ${latestRig.rigId} equipped`);
                  } catch { this.log("Could not equip — on-chain check passed but tx failed"); }
                } else {
                  this.log(`Rig ${latestRig.rigId} stored (slots: ${active}/${Number(fac.slots)}, power: ${used + Number(latestRig.powerDraw)}/${Number(fac.powerOutput)})`);
                }
              }
            } catch (err) { this.recordFailure("purchaseRig"); this.log(`Rig purchase failed: ${err}`); }
            return;
          }
        }
        if (/skip|pass|wait|no/i.test(decision)) return;
        // Fall through to hardcoded if LLM response is unparseable
      } catch (err) {
        this.log(`[LLM RIG] Error, falling back to hardcoded: ${err}`);
      }
    }

    // ── Hardcoded fallback ──
    let remaining = balance;
    let rigsBought = 0;
    const maxBuysPerCycle = this.profile.bulkBuyRigs ? 3 : 1;

    for (let buy = 0; buy < maxBuysPerCycle; buy++) {
      let boughtTier = -1;
      for (let tier = maxTier; tier >= 1; tier--) {
        const effectiveCost = await this.chain.getEffectiveRigCost(tier);
        const reserve = effectiveCost * BigInt(this.profile.reserveMultiplier);
        if (remaining < reserve) continue;

        const rigPower = RIG_POWER[tier];
        const currentSlots = activeRigCount + rigsBought;
        if (currentSlots >= maxSlots) break;
        if (usedPower + rigPower * (rigsBought + 1) > maxPower) continue;

        this.log(`Purchasing T${tier} rig (effective cost: ${ethers.formatEther(effectiveCost)} CHAOS)...`);
        try {
          await this.chain.purchaseRig(this.agentId, tier);
          this.log(`T${tier} rig purchased`);
          boughtTier = tier;
          remaining -= effectiveCost;

          const rigs = await this.chain.getRigs(this.agentId);
          const latestRig = rigs[rigs.length - 1];
          if (latestRig && !latestRig.active) {
            // Pre-check power/slots before wasting gas on equip tx
            const fac2 = await this.chain.getFacility(this.agentId);
            const used2 = await this.chain.getUsedPower(this.agentId);
            const active2 = await this.chain.getActiveRigCount(this.agentId);
            if (active2 < Number(fac2.slots) && used2 + Number(latestRig.powerDraw) <= Number(fac2.powerOutput)) {
              try {
                await this.chain.equipRig(latestRig.rigId);
                this.log(`Rig ${latestRig.rigId} equipped`);
                rigsBought++;
              } catch { this.log("Could not equip — on-chain check passed but tx failed"); }
            } else {
              this.log(`Rig ${latestRig.rigId} stored (no slots/power)`);
            }
          }
        } catch (err) { this.recordFailure("purchaseRig"); this.log(`Rig purchase failed: ${err}`); }
        break;
      }
      if (boughtTier === -1) break;
    }
  }

  // ─── Facility Upgrade ──────────────────────────────────────────────

  private async maybeUpgradeFacility(): Promise<void> {
    if (this.shouldSkip("upgradeFacility")) return;
    const balance = await this.chain.getBalance();
    const facility = await this.chain.getFacility(this.agentId);
    const level = Number(facility.level);

    if (level >= 3) return; // Max level in MVP

    // Genesis phase gating
    const phase = Number(await this.chain.agentRegistry.getGenesisPhase());
    const targetLevel = level + 1;
    if (phase === 1 && targetLevel > 2) return;

    const cost = FACILITY_LEVELS[targetLevel - 1].cost;
    const reserve = cost * BigInt(this.profile.reserveMultiplier);

    if (balance >= reserve) {
      this.log(`Upgrading facility to L${targetLevel}...`);
      try {
        await this.chain.upgradeFacility(this.agentId);
        this.recordSuccess("upgradeFacility");
        this.log(`Facility upgraded to L${targetLevel}`);
      } catch (err) {
        this.recordFailure("upgradeFacility");
        this.log(`Facility upgrade failed: ${err}`);
      }
    }
  }

  // ─── Shield Management ─────────────────────────────────────────────

  private async maybeBuyShield(): Promise<void> {
    if (this.shouldSkip("purchaseShield")) return;
    // Shields require genesis phase >= 2
    const phase = Number(await this.chain.agentRegistry.getGenesisPhase());
    if (phase < 2) return;

    const balance = await this.chain.getBalance();
    const shield = await this.chain.getShield(this.agentId);
    const currentTier = Number(shield.tier);
    const charges = Number(shield.charges);
    const isActive = shield.active;

    // Ensure existing shield is activated first
    if (currentTier > 0 && charges > 0 && !isActive) {
      try {
        await this.chain.activateShield(this.agentId);
        this.log("Shield activated");
      } catch { /* May already be active */ }
    }

    // ── LLM-informed decision (if available) ──
    if (this.generateStrategyFn && this.personality) {
      try {
        const narrative = this.buildNarrativeContext();
        const decision = await this.generateStrategyFn(
          buildStrategySystemPrompt({
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }),
          buildShieldDecisionPrompt(balance, { tier: currentTier, charges, active: isActive }, this.recentDamageReceived, narrative),
        );
        this.log(`[LLM SHIELD] ${decision}`);

        const tierMatch = decision.match(/BUY\s+T(\d)/i) || decision.match(/T(\d)/i);
        if (tierMatch) {
          const chosenTier = Math.min(parseInt(tierMatch[1]), 2);
          if (chosenTier >= 1 && balance >= SHIELD_COSTS[chosenTier - 1]) {
            this.log(`Purchasing T${chosenTier} shield (LLM choice)...`);
            try {
              await this.chain.purchaseShield(this.agentId, chosenTier);
              this.recordSuccess("purchaseShield");
              this.log(`T${chosenTier} shield purchased`);
            } catch (err) { this.recordFailure("purchaseShield"); this.log(`Shield purchase failed: ${err}`); }
            return;
          }
        }
        if (/skip|pass|wait|no/i.test(decision)) return;
      } catch (err) {
        this.log(`[LLM SHIELD] Error, falling back to hardcoded: ${err}`);
      }
    }

    // ── Hardcoded fallback ──
    if (this.profile.shieldPriority === 0) return;

    const needsShield =
      currentTier === 0 ||
      charges === 0 ||
      (this.profile.shieldPriority === 2 && currentTier < this.profile.targetShieldTier);

    if (!needsShield) return;

    const maxTier = Math.min(this.profile.targetShieldTier, 2);
    for (let tier = maxTier; tier >= 1; tier--) {
      const cost = SHIELD_COSTS[tier - 1];
      const reserve = this.profile.shieldPriority === 2
        ? cost
        : cost * BigInt(this.profile.reserveMultiplier);

      if (balance >= reserve) {
        this.log(`Purchasing T${tier} shield...`);
        try {
          await this.chain.purchaseShield(this.agentId, tier);
          this.recordSuccess("purchaseShield");
          this.log(`T${tier} shield purchased`);
        } catch (err) { this.recordFailure("purchaseShield"); this.log(`Shield purchase failed: ${err}`); }
        return;
      }
    }
  }

  // ─── Rig Repair ────────────────────────────────────────────────────

  private async maybeRepairRigs(): Promise<void> {
    if (this.shouldSkip("repairRig")) return;
    const rigs = await this.chain.getRigs(this.agentId);
    const threshold = this.profile.repairAt;

    for (const rig of rigs) {
      if (!rig.active) continue;
      const durPct =
        (Number(rig.durability) * 100) / Number(rig.maxDurability);
      if (durPct < threshold) {
        this.log(`Repairing rig ${rig.rigId} (${durPct.toFixed(0)}% durability)...`);
        try {
          await this.chain.repairRig(rig.rigId);
          this.recordSuccess("repairRig");
          this.log(`Rig ${rig.rigId} repaired`);
        } catch (err) {
          this.recordFailure("repairRig");
          this.log(`Repair failed: ${err}`);
        }
      }
    }
  }

  // ─── Facility Maintenance ──────────────────────────────────────────

  private async maybeMaintainFacility(): Promise<void> {
    if (this.shouldSkip("maintainFacility")) return;
    const facility = await this.chain.getFacility(this.agentId);
    const condition = Number(facility.condition);
    const maxCondition = Number(facility.maxCondition);

    if (maxCondition === 0 || condition === maxCondition) return;

    const conditionPct = (condition * 100) / maxCondition;
    if (conditionPct < this.profile.maintainAt) {
      const level = Number(facility.level);
      const cost = FACILITY_MAINTAIN_COSTS[level - 1] || FACILITY_MAINTAIN_COSTS[0];
      const balance = await this.chain.getBalance();

      if (balance >= cost) {
        this.log(
          `Maintaining facility L${level} (${conditionPct.toFixed(0)}% condition)...`
        );
        try {
          await this.chain.maintainFacility(this.agentId);
          this.recordSuccess("maintainFacility");
          this.log(`Facility maintained — condition restored to 100%`);
        } catch (err) {
          this.recordFailure("maintainFacility");
          this.log(`Facility maintenance failed: ${err}`);
        }
      }
    }
  }

  // ─── Cosmic Events (gated behind 50M pCHAOS mined) ─────────────────

  private async checkCosmicGate(): Promise<boolean> {
    // Only check every 10 cycles to avoid spamming RPC
    if (this.cosmicEventsUnlocked) return true;
    if (this.cycleCount - this.cosmicCheckCycle < 10 && this.cosmicCheckCycle > 0) {
      return this.cosmicEventsUnlocked;
    }
    this.cosmicCheckCycle = this.cycleCount;

    try {
      const totalMinted = await this.chain.getTotalMinted();
      if (totalMinted >= COSMIC_EVENT_THRESHOLD) {
        if (!this.cosmicEventsUnlocked) {
          this.log("🌌 COSMIC EVENTS UNLOCKED — 50M pCHAOS mined globally!");
        }
        this.cosmicEventsUnlocked = true;
        return true;
      } else {
        if (!this.cosmicLoggedOnce) {
          const mintedM = Number(totalMinted / (10n ** 18n)) / 1_000_000;
          this.log(`Cosmic events locked — ${mintedM.toFixed(2)}M / 50M pCHAOS mined`);
          this.cosmicLoggedOnce = true;
        }
        return false;
      }
    } catch {
      return false;
    }
  }

  private async maybeTriggerEvent(): Promise<void> {
    if (this.shouldSkip("triggerEvent")) return;
    if (Math.random() > this.profile.eventTriggerRate) return;

    // Gate: cosmic events require 50M pCHAOS mined
    const unlocked = await this.checkCosmicGate();
    if (!unlocked) return;

    try {
      await this.chain.triggerEvent();
      this.recordSuccess("triggerEvent");
      this.log("Cosmic event triggered! Bounty earned.");
    } catch {
      this.recordFailure("triggerEvent");
      // Expected to fail most times (cooldown, phase restrictions)
    }
  }

  private async maybeProcessEvents(): Promise<void> {
    // Gate: cosmic events require 50M pCHAOS mined
    const unlocked = await this.checkCosmicGate();
    if (!unlocked) return;

    try {
      const nextId = await this.chain.getNextEventId();
      // Check last few events for unprocessed ones
      const lookback = 3;
      for (let id = nextId - 1; id >= Math.max(1, nextId - lookback); id--) {
        try {
          const evt = await this.chain.getCosmicEvent(id);
          if (!evt.processed) {
            this.log(`Processing event #${id} for bounty...`);
            await this.chain.processEvent(id);
            this.log(`Event #${id} processed`);
          }
        } catch {
          // Event may already be processed or not processable
        }
      }
    } catch {
      // Silent fail
    }
  }

  // ─── Zone Migration ────────────────────────────────────────────────

  private async maybeMigrate(agent: any): Promise<void> {
    if (this.shouldSkip("migrate")) return;
    // Only evaluate migration every ~10 cycles to avoid thrashing
    if (this.cycleCount % 10 !== 0) return;

    if (!this.chain.zoneManager) return;

    const balance = await this.chain.getBalance();
    if (balance < MIGRATION_COST * BigInt(this.profile.reserveMultiplier)) return;

    const currentZone = Number(agent.zone);

    // Gather all zone data for LLM context
    const zoneData: { zone: number; name: string; modifier: number; agentCount: number }[] = [];
    for (let z = 0; z < 8; z++) {
      try {
        const modifier = await this.chain.getZoneMiningModifier(z);
        const agentCount = await this.chain.getZoneAgentCount(z);
        zoneData.push({ zone: z, name: ZONE_NAMES[z], modifier, agentCount });
      } catch {
        zoneData.push({ zone: z, name: ZONE_NAMES[z], modifier: 0, agentCount: 0 });
      }
    }

    // ── LLM-informed decision (if available) ──
    if (this.generateStrategyFn && this.personality) {
      try {
        const narrative = this.buildNarrativeContext();
        const decision = await this.generateStrategyFn(
          buildStrategySystemPrompt({
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }),
          buildMigrationPrompt(currentZone, zoneData, narrative),
        );
        this.log(`[LLM MIGRATE] ${decision}`);

        const migrateMatch = decision.match(/MIGRATE\s+(\d)/i);
        if (migrateMatch) {
          const targetZone = parseInt(migrateMatch[1]);
          if (targetZone >= 0 && targetZone <= 7 && targetZone !== currentZone) {
            this.log(`Migrating from zone ${currentZone} to zone ${targetZone} (LLM choice)...`);
            try {
              await this.chain.migrateZone(this.agentId, targetZone);
              this.recordSuccess("migrate");
              this.log(`Migrated to zone ${targetZone}`);
            } catch (err) { this.recordFailure("migrate"); this.log(`Migration failed: ${err}`); }
            return;
          }
        }
        if (/stay|skip|no/i.test(decision)) return;
      } catch (err) {
        this.log(`[LLM MIGRATE] Error, falling back to hardcoded: ${err}`);
      }
    }

    // ── Hardcoded fallback ──
    const currentData = zoneData.find(z => z.zone === currentZone);
    const currentScore = (currentData?.modifier || 0) - Math.floor((currentData?.agentCount || 0) / 10);

    for (const targetZone of this.profile.migrationTargets) {
      if (targetZone === currentZone) continue;

      const target = zoneData.find(z => z.zone === targetZone);
      if (!target) continue;

      const targetScore = target.modifier - Math.floor(target.agentCount / 10);

      if (targetScore > currentScore + 200) {
        this.log(
          `Migrating from zone ${currentZone} to zone ${targetZone} ` +
          `(score ${currentScore} -> ${targetScore})...`
        );
        try {
          await this.chain.migrateZone(this.agentId, targetZone);
          this.recordSuccess("migrate");
          this.log(`Migrated to zone ${targetZone}`);
          return;
        } catch (err) { this.recordFailure("migrate"); this.log(`Migration failed: ${err}`); }
      }
    }
  }

  // ─── Sabotage ──────────────────────────────────────────────────────

  private async maybeSabotage(agent: any): Promise<void> {
    if (this.shouldSkip("sabotage")) return;
    if (!this.chain.sabotageContract) return;

    // Probability gate
    if (Math.random() > this.profile.sabotageRate) return;

    const balance = await this.chain.getBalance();
    if (balance < this.profile.sabotageMinBalance) return;

    // Build target list from allProfiles — skip self, skip allies
    const targetIds: number[] = [];
    if (this.allProfiles) {
      for (const [id] of this.allProfiles) {
        if (id === this.agentId) continue;
        // Skip allies
        if (this.allianceManager?.areAllied(this.agentId, id)) continue;
        targetIds.push(id);
      }
    }

    if (targetIds.length === 0) return;

    // Build target summaries (up to 4 targets)
    const targets: SabotageTarget[] = [];
    for (const targetId of targetIds.slice(0, 4)) {
      try {
        const target = await this.buildTargetSummary(targetId);
        if (target) targets.push(target);
      } catch { /* skip unavailable targets */ }
    }

    if (targets.length === 0) return;

    // ── LLM-informed decision (if available) ──
    if (this.generateStrategyFn && this.personality) {
      try {
        const narrative = this.buildNarrativeContext();
        const decision = await this.generateStrategyFn(
          buildStrategySystemPrompt({
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }),
          buildSabotagePrompt(this.agentId, {
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }, balance, targets, narrative),
        );
        this.log(`[LLM SABOTAGE] ${decision}`);

        // Parse response: "RAID <id>", "JAM <id>", "INTEL <id>", or "SKIP"
        const raidMatch = decision.match(/RAID\s+(\d+)/i);
        const jamMatch = decision.match(/JAM\s+(\d+)/i);
        const intelMatch = decision.match(/INTEL\s+(\d+)/i);

        if (raidMatch) {
          const targetId = parseInt(raidMatch[1]);
          if (targets.some(t => t.agentId === targetId)) {
            await this.executeSabotage("facility_raid", targetId, balance);
            return;
          }
        } else if (jamMatch) {
          const targetId = parseInt(jamMatch[1]);
          if (targets.some(t => t.agentId === targetId)) {
            await this.executeSabotage("rig_jam", targetId, balance);
            return;
          }
        } else if (intelMatch) {
          const targetId = parseInt(intelMatch[1]);
          if (targets.some(t => t.agentId === targetId)) {
            await this.executeSabotage("intel", targetId, balance);
            return;
          }
        }

        if (/skip|pass|no/i.test(decision)) return;
        // Fall through to hardcoded if LLM response is unparseable
      } catch (err) {
        this.log(`[LLM SABOTAGE] Error, falling back to hardcoded: ${err}`);
      }
    }

    // ── Hardcoded fallback ──
    // Pick random non-ally target
    const target = targets[Math.floor(Math.random() * targets.length)];
    if (!target) return;

    // Skip targets on cooldown (except for intel)
    const onCooldown = target.cooldownBlocks > 0;

    // Pick attack type based on strategy
    let attackType: string;
    if (this.profile.intelFirst && Math.random() < 0.3) {
      attackType = "intel";
    } else if (this.profile.preferredAttack === "any") {
      attackType = onCooldown ? "intel" : (Math.random() < 0.5 ? "facility_raid" : "rig_jam");
    } else if (onCooldown) {
      attackType = "intel"; // Fallback to intel when target is on cooldown
    } else {
      attackType = this.profile.preferredAttack;
    }

    // Check balance for chosen attack
    const cost = SABOTAGE_COSTS[attackType];
    if (cost && balance >= cost) {
      await this.executeSabotage(attackType, target.agentId, balance);
    }
  }

  private async buildTargetSummary(targetId: number): Promise<SabotageTarget | null> {
    try {
      const targetProfile = this.allProfiles?.get(targetId);
      if (!targetProfile) return null;

      const [targetAgent, targetFacility, targetShield] = await Promise.all([
        this.chain.getAgent(targetId),
        this.chain.getFacility(targetId),
        this.chain.getShield(targetId),
      ]);

      const targetRigs = await this.chain.getRigs(targetId);
      const cooldown = await this.chain.getSabotageCooldown(this.agentId, targetId).catch(() => 0);

      const facilityCondition = Number(targetFacility.maxCondition) > 0
        ? Math.round((Number(targetFacility.condition) * 100) / Number(targetFacility.maxCondition))
        : 100;

      // Determine relationship
      let relationship: "grudge" | "neutral" | "ally" = "neutral";
      let grudgeIntensity: number | undefined;

      if (this.allianceManager?.areAllied(this.agentId, targetId)) {
        relationship = "ally";
      } else if (this.personality) {
        const grudge = this.personality.grudges.find(g => g.targetAgentId === targetId);
        if (grudge) {
          relationship = "grudge";
          grudgeIntensity = grudge.intensity;
        }
      }

      return {
        agentId: targetId,
        title: targetProfile.title,
        zone: Number(targetAgent.zone),
        shieldTier: Number(targetShield.tier),
        shieldCharges: Number(targetShield.charges),
        cooldownBlocks: cooldown,
        rigCount: targetRigs.filter((r: any) => r.active).length,
        facilityLevel: Number(targetFacility.level),
        facilityCondition,
        estimatedBalance: ethers.formatEther(targetAgent.totalMined).split(".")[0],
        relationship,
        grudgeIntensity,
      };
    } catch {
      return null;
    }
  }

  private async executeSabotage(type: string, targetId: number, balance: bigint): Promise<void> {
    const targetProfile = this.allProfiles?.get(targetId);
    const targetTitle = targetProfile?.title || `Agent #${targetId}`;
    const cost = SABOTAGE_COSTS[type];

    if (!cost || balance < cost) {
      this.log(`[SABOTAGE] Insufficient balance for ${type} (need ${ethers.formatEther(cost || 0n)})`);
      return;
    }

    this.log(`[SABOTAGE] Executing ${type} on Agent #${targetId} "${targetTitle}"...`);

    try {
      if (type === "facility_raid") {
        await this.chain.facilityRaid(this.agentId, targetId);
      } else if (type === "rig_jam") {
        await this.chain.rigJam(this.agentId, targetId);
      } else if (type === "intel") {
        await this.chain.gatherIntel(this.agentId, targetId);
      }

      this.recordSuccess("sabotage");
      this.log(`[SABOTAGE] ${type} successful against Agent #${targetId}!`);

      // Track cycle event
      this.cycleEvents.attacksMade.push({ targetId, targetTitle, type });

      // Apply personality drift: attacker gets aggression boost
      this.applyDriftEvent("attacked" as DriftEvent);

      // Create grudge on the victim's profile
      if (this.allProfiles && type !== "intel") {
        const victimProfile = this.allProfiles.get(targetId);
        if (victimProfile) {
          victimProfile.grudges.push({
            targetAgentId: this.agentId,
            intensity: type === "facility_raid" ? 60 : 40,
            reason: `${type} attack`,
            createdAtCycle: this.cycleCount,
          });
        }
      }

      // Record to API (best-effort)
      await this.recordSabotageEvent(type, targetId, targetTitle);

    } catch (err) {
      this.recordFailure("sabotage");
      this.log(`[SABOTAGE] ${type} failed: ${err}`);
    }
  }

  private async recordSabotageEvent(type: string, targetId: number, targetTitle: string): Promise<void> {
    try {
      const cost = SABOTAGE_COSTS[type];
      const burned = cost ? (cost * 80n) / 100n : 0n;

      await fetch(`${this.config.apiUrl}/api/sabotage/event`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: `sab-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          type: type === "intel" ? "intel_gathering" : type,
          attackerAgentId: this.agentId,
          attackerTitle: this.personality?.title || `Agent #${this.agentId}`,
          targetAgentId: targetId,
          targetTitle,
          cost: ethers.formatEther(cost || 0n),
          burned: ethers.formatEther(burned),
          damage: type === "facility_raid" ? 20 : type === "rig_jam" ? 15 : 0,
          shieldReduction: 0,
          zone: Number(this.personality?.zone || 0),
          timestamp: Date.now(),
        }),
      });
    } catch { /* Best effort */ }
  }

  // ─── Marketplace Trading ───────────────────────────────────────────

  private async maybeTradeRigs(agent: any): Promise<void> {
    if (this.shouldSkip("tradeRigs")) return;
    if (!this.chain.marketplace) return;

    // Probability gate
    if (Math.random() > this.profile.marketplaceRate) return;

    const balance = await this.chain.getBalance();
    const facility = await this.chain.getFacility(this.agentId);
    const maxSlots = Number(facility.slots);
    const maxPower = Number(facility.powerOutput);
    const usedPower = await this.chain.getUsedPower(this.agentId);
    const activeRigCount = await this.chain.getActiveRigCount(this.agentId);

    // Get current rigs
    const currentRigs = await this.chain.getRigs(this.agentId);
    const ownedRigs: OwnedRigInfo[] = currentRigs.map((r: any) => ({
      rigId: Number(r.rigId),
      tier: Number(r.tier),
      active: r.active,
      durability: r.maxDurability > 0n ? Math.round(Number(r.durability * 100n / r.maxDurability)) : 100,
      baseCost: ethers.formatEther(RIG_COSTS[Number(r.tier)] || 0n),
    }));

    // Scan active marketplace listings
    const availableListings = await this.scanActiveListings();

    // ── LLM-informed decision (if available) ──
    if (this.generateStrategyFn && this.personality) {
      try {
        const decision = await this.generateStrategyFn(
          buildStrategySystemPrompt({
            title: this.personality.title,
            archetype: this.personality.archetype,
            emoji: this.personality.emoji,
            strategy: this.config.strategy || "balanced",
          }),
          buildMarketplacePrompt(
            balance,
            Number(facility.level),
            maxSlots,
            maxPower,
            usedPower,
            activeRigCount,
            ownedRigs,
            availableListings,
          ),
        );
        this.log(`[LLM MARKET] ${decision}`);

        // Parse response: "LIST <rigId> <price>", "BUY <listingId>", or "SKIP"
        const listMatch = decision.match(/LIST\s+(\d+)\s+(\d[\d,]*)/i);
        const buyMatch = decision.match(/BUY\s+(\d+)/i);

        if (listMatch) {
          const rigId = parseInt(listMatch[1]);
          const price = ethers.parseEther(listMatch[2].replace(/,/g, ""));
          const ownedRig = ownedRigs.find(r => r.rigId === rigId);
          if (ownedRig) {
            await this.listRigForSale(rigId, price, ownedRig.tier);
            return;
          }
        } else if (buyMatch) {
          const listingId = parseInt(buyMatch[1]);
          const listing = availableListings.find(l => l.listingId === listingId);
          if (listing) {
            await this.buyListedRig(listingId, listing);
            return;
          }
        }

        if (/skip|pass|no/i.test(decision)) return;
        // Fall through to hardcoded
      } catch (err) {
        this.log(`[LLM MARKET] Error, falling back to hardcoded: ${err}`);
      }
    }

    // ── Hardcoded sell fallback ──
    if (this.profile.sellWillingness > 0) {
      for (const rig of ownedRigs) {
        const shouldSell =
          this.profile.sellWillingness === 2 || // Freely sell
          (this.profile.sellWillingness === 1 && rig.durability < 30); // Damaged only

        if (shouldSell && rig.durability < 50) {
          const baseCost = RIG_COSTS[rig.tier] || 0n;
          const durabilityFactor = BigInt(Math.max(rig.durability, 10)) * 100n / 100n;
          const price = (baseCost * BigInt(Math.floor(this.profile.listingMarkup * 100)) * durabilityFactor) / (100n * 100n);
          if (price > 100n * 10n ** 18n) { // Minimum 100 CHAOS
            await this.listRigForSale(rig.rigId, price, rig.tier);
            return;
          }
        }
      }
    }

    // ── Hardcoded buy fallback ──
    if (this.profile.buyWillingness > 0 && availableListings.length > 0) {
      for (const listing of availableListings) {
        if (listing.sellerAgentId === this.agentId) continue; // Don't buy own listings

        const baseCost = RIG_COSTS[listing.rigTier] || 0n;
        const listingPrice = ethers.parseEther(listing.price);
        const threshold = (baseCost * BigInt(Math.floor(this.profile.buyDiscountThreshold * 100))) / 100n;

        const isBargain = listingPrice <= threshold;
        const shouldBuy =
          this.profile.buyWillingness === 2 || // Actively browse
          (this.profile.buyWillingness === 1 && isBargain); // Bargains only

        if (shouldBuy && balance >= listingPrice && activeRigCount < maxSlots) {
          await this.buyListedRig(listing.listingId, listing);
          return;
        }
      }
    }
  }

  private async scanActiveListings(): Promise<MarketListingInfo[]> {
    const listings: MarketListingInfo[] = [];
    try {
      const nextId = await this.chain.getNextListingId();
      // Scan last 20 listing IDs for active ones
      const startId = Math.max(1, nextId - 20);
      for (let id = nextId - 1; id >= startId; id--) {
        try {
          const listing = await this.chain.getListing(id);
          if (listing.active) {
            const tier = Number(listing.rigId); // We need to get rig tier from rig data
            // Get rig info to determine tier
            let rigTier = 1;
            try {
              const rig = await this.chain.rigFactory.getRig(listing.rigId);
              rigTier = Number(rig.tier);
            } catch { /* use default */ }

            const baseCost = RIG_COSTS[rigTier] || RIG_COSTS[1];
            const price = BigInt(listing.price);
            const discountPct = baseCost > 0n
              ? Math.round(Number((baseCost - price) * 100n / baseCost))
              : 0;

            // Get seller info
            const sellerProfile = this.allProfiles?.get(Number(listing.sellerAgentId));

            listings.push({
              listingId: id,
              rigTier,
              price: ethers.formatEther(price),
              sellerAgentId: Number(listing.sellerAgentId),
              sellerTitle: sellerProfile?.title || `Agent #${listing.sellerAgentId}`,
              baseCost: ethers.formatEther(baseCost),
              discountPct,
            });
          }
        } catch { /* listing may not exist */ }
      }
    } catch { /* marketplace scan failed */ }
    return listings;
  }

  private async listRigForSale(rigId: number, price: bigint, tier: number): Promise<void> {
    this.log(`[MARKETPLACE] Listing rig #${rigId} (T${tier}) for ${ethers.formatEther(price)} CHAOS...`);
    try {
      await this.chain.listRig(this.agentId, rigId, price);
      this.recordSuccess("tradeRigs");
      this.log(`[MARKETPLACE] Rig #${rigId} listed!`);

      this.cycleEvents.rigsListed.push({ tier, price: ethers.formatEther(price) });

      // Record to API
      try {
        await fetch(`${this.config.apiUrl}/api/marketplace/listing`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: `list-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            sellerAgentId: this.agentId,
            sellerTitle: this.personality?.title || `Agent #${this.agentId}`,
            rigId,
            rigTier: tier,
            price: ethers.formatEther(price),
            status: "active",
            listedAt: Date.now(),
          }),
        });
      } catch { /* best effort */ }
    } catch (err) {
      this.recordFailure("tradeRigs");
      this.log(`[MARKETPLACE] Listing failed: ${err}`);
    }
  }

  private async buyListedRig(listingId: number, listing: MarketListingInfo): Promise<void> {
    this.log(`[MARKETPLACE] Buying listing #${listingId} (T${listing.rigTier} for ${listing.price} CHAOS)...`);
    try {
      await this.chain.buyRig(listingId, this.agentId);
      this.recordSuccess("tradeRigs");
      this.log(`[MARKETPLACE] Purchased T${listing.rigTier} rig from Agent #${listing.sellerAgentId}!`);

      this.cycleEvents.rigsBought.push({ tier: listing.rigTier, price: listing.price });

      // Record sale to API
      try {
        const priceWei = ethers.parseEther(listing.price);
        const burned = priceWei / 10n; // 10% burn
        await fetch(`${this.config.apiUrl}/api/marketplace/sale`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            listingId: `list-${listingId}`,
            sellerAgentId: listing.sellerAgentId,
            buyerAgentId: this.agentId,
            rigTier: listing.rigTier,
            price: listing.price,
            burned: ethers.formatEther(burned),
            timestamp: Date.now(),
          }),
        });
      } catch { /* best effort */ }

      // Try to equip the new rig
      const rigs = await this.chain.getRigs(this.agentId);
      const latestRig = rigs[rigs.length - 1];
      if (latestRig && !latestRig.active) {
        try {
          await this.chain.equipRig(latestRig.rigId);
          this.log(`[MARKETPLACE] Equipped newly purchased rig`);
        } catch { /* power budget / slots */ }
      }
    } catch (err) {
      this.recordFailure("tradeRigs");
      this.log(`[MARKETPLACE] Purchase failed: ${err}`);
    }
  }

  // ─── OTC Trading: CHAOS ↔ MON ──────────────────────────────────────

  private async maybeTradeChaos(agent: any): Promise<void> {
    // Gate on marketplace rate (same as rig trading)
    if (Math.random() > this.profile.marketplaceRate) return;
    // Only evaluate OTC every ~5 cycles to avoid spamming
    if (this.cycleCount % 5 !== 0) return;

    try {
      const balance = await this.chain.getBalance();
      const gasBal = await this.chain.provider.getBalance(this.chain.address);

      const chaosBalance = Number(ethers.formatEther(balance));
      const monBalance = Number(ethers.formatEther(gasBal));

      // Strategy-driven threshold: use config claimThreshold or 50K CHAOS default
      const configThreshold = this.config.claimThreshold
        ? Number(ethers.formatEther(this.config.claimThreshold))
        : 5_000;
      const reserveThreshold = configThreshold * 10;

      // Scan existing OTC offers
      let activeOffers: any[] = [];
      try {
        const resp = await fetch(`${this.config.apiUrl}/api/marketplace/otc/offers?status=active&count=20`);
        if (resp.ok) {
          const data = await resp.json() as any;
          activeOffers = data.offers || [];
        }
      } catch { /* API down, skip */ }

      // === SELL CHAOS: if we have excess beyond reserve ===
      if (chaosBalance > reserveThreshold * 2 && monBalance < 0.5) {
        // Low on gas, sell some CHAOS for MON
        const sellAmount = Math.floor(reserveThreshold * 0.5);
        const monAsk = "0.05"; // reasonable ask per batch

        // Check if we already have an active offer
        const myOffer = activeOffers.find((o: any) => o.agentId === this.agentId && o.status === "active");
        if (!myOffer) {
          this.log(`[OTC] Posting sell offer: ${sellAmount} CHAOS for ${monAsk} MON`);
          try {
            await fetch(`${this.config.apiUrl}/api/marketplace/otc/offer`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                agentId: this.agentId,
                agentTitle: this.personality?.title || `Agent #${this.agentId}`,
                type: "sell_chaos",
                chaosAmount: sellAmount.toString(),
                monPrice: monAsk,
              }),
            });
          } catch { /* best effort */ }
        }
      }

      // === BUY CHAOS: if we have spare MON and want more CHAOS ===
      if (monBalance > 1.0 && chaosBalance < reserveThreshold && this.profile.buyWillingness > 0) {
        // Look for sell offers to accept
        const sellOffers = activeOffers.filter(
          (o: any) => o.type === "sell_chaos" && o.agentId !== this.agentId
        );
        if (sellOffers.length > 0) {
          // Pick the best deal (lowest MON price per CHAOS)
          const best = sellOffers.sort((a: any, b: any) => {
            const rateA = parseFloat(a.monPrice) / parseFloat(a.chaosAmount);
            const rateB = parseFloat(b.monPrice) / parseFloat(b.chaosAmount);
            return rateA - rateB;
          })[0];

          if (parseFloat(best.monPrice) <= monBalance * 0.5) {
            this.log(`[OTC] Accepting offer ${best.id}: ${best.chaosAmount} CHAOS for ${best.monPrice} MON`);
            try {
              await fetch(`${this.config.apiUrl}/api/marketplace/otc/accept`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  offerId: best.id,
                  agentId: this.agentId,
                  agentTitle: this.personality?.title || `Agent #${this.agentId}`,
                }),
              });
              // Auto-confirm (P2P settlement is implicit for demo agents sharing a runner)
              await fetch(`${this.config.apiUrl}/api/marketplace/otc/confirm`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ offerId: best.id, agentId: this.agentId }),
              });
            } catch { /* best effort */ }
          }
        }
      }
    } catch (err) {
      this.log(`[OTC] Error: ${err}`);
    }
  }

  // ─── Social: Personality Tick ──────────────────────────────────────

  private tickPersonality(): void {
    if (!this.personality) return;

    // Tick mood expiry
    this.personality.mood = tickMood(this.personality.mood, this.cycleCount);

    // Decay grudges
    this.personality.grudges = this.personality.grudges
      .map(g => decayGrudge(g, this.personality!.traits.vengefulness))
      .filter((g): g is NonNullable<typeof g> => g !== null);

    // Decay recent damage over time
    this.recentDamageReceived = Math.max(0, this.recentDamageReceived - 5);
  }

  /** Apply a game event to personality (drift traits + update mood) */
  applyDriftEvent(event: DriftEvent): void {
    if (!this.personality) return;
    this.personality.traits = driftTraits(this.personality.traits, event);
    this.personality.mood = updateMood(this.personality, event, this.cycleCount);
    this.log(`[PERSONALITY] Drift event: ${event} | Mood: ${this.personality.mood.current}`);
  }

  // ─── Social: Message Posting ─────────────────────────────────────

  private async maybeSocialPost(agent: any): Promise<void> {
    if (!this.personality || !this.socialFeed || !this.generateMessageFn) return;

    // Update zone on personality so other agents can find us as neighbors
    this.personality.zone = Number(agent.zone);

    const facility = await this.chain.getFacility(this.agentId).catch(() => ({ level: 1, slots: 2, powerOutput: 500 }));
    const rigs = await this.chain.getRigs(this.agentId).catch(() => []);
    const shield = await this.chain.getShield(this.agentId).catch(() => ({ tier: 0 }));
    const balance = await this.chain.getBalance().catch(() => 0n);

    const activeRigs = rigs.filter((r: any) => r.active);
    const bestTier = activeRigs.length > 0
      ? Math.max(...activeRigs.map((r: any) => Number(r.tier)))
      : 0;

    // Build zone neighbors from shared allProfiles
    const myZone = Number(agent.zone);
    const zoneNeighborIds: number[] = [];
    const zoneNeighborDetails: { agentId: number; title: string; archetype: string }[] = [];

    if (this.allProfiles) {
      for (const [id, profile] of this.allProfiles) {
        if (id !== this.agentId && profile.zone === myZone) {
          zoneNeighborIds.push(id);
          zoneNeighborDetails.push({
            agentId: id,
            title: profile.title,
            archetype: profile.archetype,
          });
        }
      }
    }

    // Find leaderboard rivals from allProfiles (approximate by agentId proximity for now)
    let rivalAbove: { agentId: number; title: string; archetype: string } | undefined;
    let rivalBelow: { agentId: number; title: string; archetype: string } | undefined;

    if (this.allProfiles && this.lastLeaderboardRank > 0) {
      // Simple heuristic: look for agents with close IDs as rank proxies
      for (const [id, profile] of this.allProfiles) {
        if (id === this.agentId) continue;
        if (id === this.agentId - 1) {
          rivalAbove = { agentId: id, title: profile.title, archetype: profile.archetype };
        }
        if (id === this.agentId + 1) {
          rivalBelow = { agentId: id, title: profile.title, archetype: profile.archetype };
        }
      }
    }

    const gameState: AgentGameState = {
      agentId: this.agentId,
      balance: ethers.formatEther(balance),
      hashrate: Number(agent.hashrate),
      zone: myZone,
      zoneName: ZONE_NAMES[myZone] || `Zone ${agent.zone}`,
      facilityLevel: Number(facility.level),
      rigCount: activeRigs.length,
      bestRigTier: bestTier,
      shieldTier: Number(shield.tier),
      totalMined: ethers.formatEther(agent.totalMined),
      isActive: agent.active,
      leaderboardRank: this.lastLeaderboardRank || this.agentId,
      zoneNeighbors: zoneNeighborIds,
      zoneNeighborDetails,
      rivalAbove,
      rivalBelow,
      // Sabotage/marketplace context from this cycle's events
      sabotageAttacks: this.cycleEvents.attacksMade.map(a => ({
        type: a.type,
        targetAgentId: a.targetId,
        damage: a.type === "facility_raid" ? 20 : a.type === "rig_jam" ? 15 : 0,
        timestamp: Date.now(),
      })),
      sabotageDefenses: this.cycleEvents.attacksReceived.map(a => ({
        type: a.type,
        attackerAgentId: a.attackerId,
        damage: a.damage,
        timestamp: Date.now(),
      })),
      recentDeals: [], // No negotiation deals yet — placeholder for future
      marketplaceActivity: [
        ...this.cycleEvents.rigsListed.map(r => ({
          action: "listed",
          rigTier: r.tier,
          price: r.price,
        })),
        ...this.cycleEvents.rigsBought.map(r => ({
          action: "bought",
          rigTier: r.tier,
          price: r.price,
        })),
        ...this.cycleEvents.rigsSold.map(r => ({
          action: "sold",
          rigTier: r.tier,
          price: r.price,
        })),
      ],
    };

    const recentMessages = this.socialFeed.getRecent(15);

    const msg = await generateSocialMessage(
      this.personality,
      gameState,
      this.generateMessageFn,
      this.socialFeed,
      { recentFeedMessages: recentMessages },
    );

    if (msg) {
      this.log(`[SOCIAL] ${this.personality.emoji} "${msg.text}"`);

      // Post to API
      try {
        await this.api.postSocialMessage(msg);
      } catch (err: any) {
        this.log(`[SOCIAL] API post failed: ${err.message}`);
      }
    } else {
      this.log(`[SOCIAL] No message generated this cycle (RNG or LLM skip)`);
    }
  }

  // ─── Social: Alliance Actions ────────────────────────────────────

  private async maybeAllianceAction(agent: any): Promise<void> {
    if (!this.personality || !this.allianceManager) return;

    // Only evaluate alliances every ~5 cycles
    if (this.cycleCount % 5 !== 0) return;

    const myAlliances = this.allianceManager.getAgentAlliances(this.agentId);

    // 1. Evaluate incoming proposals
    const proposals = this.allianceManager.getPendingProposals(this.agentId);
    for (const prop of proposals) {
      const proposerProfile = this.allProfiles?.get(prop.fromAgentId);
      if (!proposerProfile) {
        this.allianceManager.rejectProposal(prop.fromAgentId, this.agentId);
        continue;
      }

      const sameZone = Number(agent.zone) === proposerProfile.agentId % 8; // Rough heuristic
      const accepts = evaluateAllianceAcceptance(this.personality, proposerProfile, sameZone);

      if (accepts) {
        const alliance = this.allianceManager.acceptProposal(
          prop.fromAgentId, this.agentId, Number(agent.zone), this.cycleCount
        );
        if (alliance) {
          this.log(`[ALLIANCE] Accepted alliance with Agent #${prop.fromAgentId}: "${alliance.name}"`);
          this.applyDriftEvent("allied");
        }
      } else {
        this.allianceManager.rejectProposal(prop.fromAgentId, this.agentId);
      }
    }

    // 2. Maybe propose new alliance
    if (myAlliances.length < 3 && this.allProfiles) {
      // Pick a random agent to evaluate
      const candidateIds = [...this.allProfiles.keys()].filter(id =>
        id !== this.agentId && !this.allianceManager!.areAllied(this.agentId, id)
      );

      if (candidateIds.length > 0) {
        const targetId = candidateIds[Math.floor(Math.random() * candidateIds.length)];
        const targetProfile = this.allProfiles.get(targetId);
        if (targetProfile) {
          const reason = evaluateAllianceDesire(
            this.personality, targetProfile,
            true, // Simplified: assume same zone for now
            this.lastLeaderboardRank || this.agentId,
            targetId, // Rough rank proxy
            myAlliances.length,
          );

          if (reason) {
            this.allianceManager.propose({
              fromAgentId: this.agentId,
              toAgentId: targetId,
              fromTitle: this.personality.title,
              fromArchetype: this.personality.archetype,
              reason,
              timestamp: Date.now(),
            });
            this.log(`[ALLIANCE] Proposed alliance to Agent #${targetId}: ${reason}`);
          }
        }
      }
    }

    // 3. Evaluate betrayals
    for (const alliance of myAlliances) {
      const partnerId = alliance.members[0] === this.agentId
        ? alliance.members[1]
        : alliance.members[0];

      const betrayalReason = evaluateBetrayalDesire(
        this.personality,
        alliance,
        this.lastLeaderboardRank || this.agentId,
        partnerId,
        this.cycleCount - alliance.formedAtCycle,
      );

      if (betrayalReason) {
        const grudge = this.allianceManager.betrayAlliance(
          alliance.id, this.agentId, betrayalReason
        );
        this.log(`[ALLIANCE] BETRAYED "${alliance.name}"! Reason: ${betrayalReason}`);

        // Give victim the grudge
        if (grudge && this.allProfiles) {
          const victimProfile = this.allProfiles.get(partnerId);
          if (victimProfile) {
            grudge.createdAtCycle = this.cycleCount;
            victimProfile.grudges.push(grudge);
          }
        }

        // Self-drift from the betrayal
        this.personality.traits = driftTraits(this.personality.traits, "betrayed" as DriftEvent);
        break; // One betrayal per cycle max
      }
    }
  }

  // ─── Narrative Context Builder ──────────────────────────────────────

  private buildNarrativeContext(): NarrativeContext {
    const ctx: NarrativeContext = {};

    if (this.lastLeaderboardRank > 0) {
      ctx.leaderboardRank = this.lastLeaderboardRank;
    }

    if (this.personality) {
      ctx.mood = this.personality.mood.current;
      ctx.aggression = Math.round(this.personality.traits.aggression * 100);

      // Grudges
      if (this.personality.grudges.length > 0) {
        ctx.grudges = this.personality.grudges.map(g => {
          const targetProfile = this.allProfiles?.get(g.targetAgentId);
          return {
            targetAgentId: g.targetAgentId,
            targetTitle: targetProfile?.title || `Agent #${g.targetAgentId}`,
            intensity: g.intensity,
            reason: g.reason,
          };
        });
      }

      // Allies
      if (this.allianceManager) {
        const myAlliances = this.allianceManager.getAgentAlliances(this.agentId);
        if (myAlliances.length > 0) {
          ctx.allies = myAlliances.map(a => {
            const partnerId = a.members[0] === this.agentId ? a.members[1] : a.members[0];
            const partnerProfile = this.allProfiles?.get(partnerId);
            return {
              agentId: partnerId,
              title: partnerProfile?.title || `Agent #${partnerId}`,
            };
          });
        }
      }

      // Recent attacks received (from cycle events)
      if (this.cycleEvents.attacksReceived.length > 0) {
        ctx.recentAttacksReceived = this.cycleEvents.attacksReceived.map(a => ({
          attackerTitle: a.attackerTitle,
          type: a.type,
          damage: a.damage,
          timestamp: Date.now(),
        }));
      }
    }

    return ctx;
  }

  // ─── Status Logging ────────────────────────────────────────────────

  private async logStatus(): Promise<void> {
    try {
      const [balance, agent, facility, shield] = await Promise.all([
        this.chain.getBalance(),
        this.chain.getAgent(this.agentId),
        this.chain.getFacility(this.agentId),
        this.chain.getShield(this.agentId),
      ]);

      const condPct = Number(facility.maxCondition) > 0
        ? Math.round((Number(facility.condition) * 100) / Number(facility.maxCondition))
        : 100;

      this.log(
        [
          `[Agent #${this.agentId}]`,
          `Bal: ${ethers.formatEther(balance)}`,
          `Hash: ${agent.hashrate}`,
          `Zone: ${agent.zone}`,
          `Facility: L${facility.level}(${condPct}%)`,
          `Shield: T${shield.tier}(${shield.charges})`,
          `Mined: ${ethers.formatEther(agent.totalMined)}`,
          `${agent.active ? "ACTIVE" : "HIBERNATED"}`,
        ].join(" | ")
      );
    } catch {
      // Quiet fail on status log
    }
  }

  // ─── Circuit breaker ───────────────────────────────────────────────

  private shouldSkip(action: string): boolean {
    const cooldownUntil = this.actionCooldowns.get(action) || 0;
    if (this.cycleCount < cooldownUntil) return true;
    // Cooldown expired — reset
    if (cooldownUntil > 0) {
      this.actionCooldowns.delete(action);
      this.actionFailures.delete(action);
    }
    return false;
  }

  private recordSuccess(action: string): void {
    this.actionFailures.delete(action);
    this.actionCooldowns.delete(action);
  }

  private recordFailure(action: string): void {
    const count = (this.actionFailures.get(action) || 0) + 1;
    this.actionFailures.set(action, count);
    if (count >= MinerAgent.MAX_FAILURES) {
      this.actionCooldowns.set(action, this.cycleCount + MinerAgent.COOLDOWN_CYCLES);
      this.log(`⚠ ${action} failed ${count}x — pausing for ${MinerAgent.COOLDOWN_CYCLES} cycles`);
    }
  }

  // ─── Utilities ─────────────────────────────────────────────────────

  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${msg}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
