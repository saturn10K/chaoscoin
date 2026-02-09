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
  /** All agent personality profiles (for alliance evaluation) */
  allProfiles?: Map<number, PersonalityProfile>;
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

const HEARTBEAT_INTERVAL = 100_000; // blocks
const FIRST_MINE_DELAY = 10_000; // blocks

/**
 * Autonomous mining agent with differentiated strategies.
 *
 * Each strategy determines:
 * - Zone selection and migration behavior
 * - Equipment purchase priority and aggressiveness
 * - Shield acquisition timing
 * - Event triggering/processing frequency
 * - Claim timing and reserve management
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
  private allProfiles: Map<number, PersonalityProfile> | null;
  private lastLeaderboardRank = 0;

  constructor(config: MinerAgentConfig) {
    this.config = config;
    this.profile = STRATEGY_PROFILES[config.strategy || "balanced"];
    this.socialFeed = config.socialFeed || null;
    this.allianceManager = config.allianceManager || null;
    this.generateMessageFn = config.generateMessage || null;
    this.allProfiles = config.allProfiles || null;

    this.chain = new ChainClient({
      rpcUrl: config.rpcUrl,
      chainId: config.chainId,
      privateKey: config.privateKey,
      addresses: config.addresses,
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

      await this.sleep(this.config.interval || 30_000);
    }
  }

  stop(): void {
    this.running = false;
    this.log("Stopping MinerAgent...");
  }

  private async runCycle(): Promise<void> {
    const agent = await this.chain.getAgent(this.agentId);
    const blockNumber = await this.chain.provider.getBlockNumber();

    // a. HEARTBEAT — always first (triggers mint + distribute rewards on-chain)
    await this.maybeHeartbeat(agent, blockNumber);

    // b. CLAIM any remaining buffered rewards (heartbeat auto-distributes, but claim picks up leftovers)
    await this.maybeClaim(agent);

    // d/e. UPGRADE EQUIPMENT — order depends on strategy
    if (this.profile.facilityFirst) {
      await this.maybeUpgradeFacility();
      await this.maybeUpgradeRigs();
    } else {
      await this.maybeUpgradeRigs();
      await this.maybeUpgradeFacility();
    }

    // f. BUY/UPGRADE SHIELD
    await this.maybeBuyShield();

    // g. REPAIR RIGS
    await this.maybeRepairRigs();

    // g2. MAINTAIN FACILITY
    await this.maybeMaintainFacility();

    // h. TRIGGER COSMIC EVENT
    await this.maybeTriggerEvent();

    // i. PROCESS UNPROCESSED EVENTS (bounty farming)
    if (this.profile.processEvents) {
      await this.maybeProcessEvents();
    }

    // j. EVALUATE ZONE MIGRATION
    if (this.profile.willMigrate) {
      await this.maybeMigrate(agent);
    }

    // ── SOCIAL SYSTEMS ──

    // k. PERSONALITY: tick mood, decay grudges
    this.tickPersonality();

    // l. SOCIAL: maybe generate and post a message
    await this.maybeSocialPost(agent);

    // m. ALLIANCES: evaluate proposals, consider betrayals
    await this.maybeAllianceAction(agent);

    // n. LOG STATUS
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

    for (const addr of contracts) {
      const allowance: bigint = await this.chain.chaosToken.allowance(
        this.chain.address,
        addr
      );
      if (allowance < ethers.MaxUint256 / 2n) {
        this.log(`Approving spending for ${addr}...`);
        await this.chain.approveSpending(addr);
      }
    }
  }

  // ─── Heartbeat ─────────────────────────────────────────────────────

  private async maybeHeartbeat(agent: any, blockNumber: number): Promise<void> {
    // In the heartbeat-only reward model, rewards are minted each time an agent
    // heartbeats (capped at MAX_HEARTBEAT_WINDOW = 500 blocks). So we heartbeat
    // every cycle to keep rewards flowing. We still skip if fewer than 100 blocks
    // have passed (to avoid wasting gas on near-zero rewards).
    const lastHeartbeat = Number(agent.lastHeartbeat);
    const blocksSince = blockNumber - lastHeartbeat;

    if (blocksSince >= 100) {
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
    // Skip if still in first-mine delay
    const blockNumber = await this.chain.provider.getBlockNumber();
    if (blockNumber < Number(agent.registrationBlock) + FIRST_MINE_DELAY) return;

    // Check pending rewards
    try {
      const pending = await this.chain.getPendingRewards(this.agentId);
      const threshold =
        (1000n * 10n ** 18n * BigInt(Math.floor(this.profile.claimEagerness * 100))) / 100n;

      if (pending > threshold) {
        this.log(
          `Claiming ${ethers.formatEther(pending)} CHAOS (threshold ${ethers.formatEther(threshold)})...`
        );
        await this.chain.claimRewards(this.agentId);
        this.log("Rewards claimed");
      }
    } catch {
      // Silent — heartbeat already distributed, or nothing to claim
    }
  }

  // ─── Rig Purchasing ────────────────────────────────────────────────

  private async maybeUpgradeRigs(): Promise<void> {
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

    let remaining = balance;
    let rigsBought = 0;
    const maxBuysPerCycle = this.profile.bulkBuyRigs ? 3 : 1;

    for (let buy = 0; buy < maxBuysPerCycle; buy++) {
      // Find highest affordable tier that fits power budget
      let boughtTier = -1;
      for (let tier = maxTier; tier >= 1; tier--) {
        const cost = RIG_COSTS[tier];
        const reserve = cost * BigInt(this.profile.reserveMultiplier);
        if (remaining < reserve) continue;

        // Check if we have power/slot capacity for this rig
        const rigPower = RIG_POWER[tier];
        const currentSlots = activeRigCount + rigsBought;
        if (currentSlots >= maxSlots) break; // No slots
        if (usedPower + rigPower * (rigsBought + 1) > maxPower) continue; // No power

        this.log(`Purchasing T${tier} rig...`);
        try {
          await this.chain.purchaseRig(this.agentId, tier);
          this.log(`T${tier} rig purchased`);
          boughtTier = tier;
          remaining -= RIG_COSTS[tier];

          // Try to equip
          const rigs = await this.chain.getRigs(this.agentId);
          const latestRig = rigs[rigs.length - 1];
          if (latestRig && !latestRig.active) {
            try {
              await this.chain.equipRig(latestRig.rigId);
              this.log(`Rig ${latestRig.rigId} equipped`);
              rigsBought++;
            } catch {
              this.log("Could not equip — check power budget / slots");
            }
          }
        } catch (err) {
          this.log(`Rig purchase failed: ${err}`);
        }
        break; // Move to next buy iteration (start from highest tier again)
      }

      if (boughtTier === -1) break; // Nothing affordable
    }
  }

  // ─── Facility Upgrade ──────────────────────────────────────────────

  private async maybeUpgradeFacility(): Promise<void> {
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
        this.log(`Facility upgraded to L${targetLevel}`);
      } catch (err) {
        this.log(`Facility upgrade failed: ${err}`);
      }
    }
  }

  // ─── Shield Management ─────────────────────────────────────────────

  private async maybeBuyShield(): Promise<void> {
    if (this.profile.shieldPriority === 0) return;

    // Shields require genesis phase >= 2
    const phase = Number(await this.chain.agentRegistry.getGenesisPhase());
    if (phase < 2) return;

    const balance = await this.chain.getBalance();
    const shield = await this.chain.getShield(this.agentId);
    const currentTier = Number(shield.tier);
    const charges = Number(shield.charges);
    const isActive = shield.active;

    // Determine if we need a shield
    const needsShield =
      currentTier === 0 ||
      charges === 0 ||
      (this.profile.shieldPriority === 2 && currentTier < this.profile.targetShieldTier);

    if (!needsShield) {
      // Ensure existing shield is activated
      if (currentTier > 0 && charges > 0 && !isActive) {
        try {
          await this.chain.activateShield(this.agentId);
          this.log("Shield activated");
        } catch {
          // May already be active
        }
      }
      return;
    }

    // Try to buy target tier, fall back to lower
    const maxTier = Math.min(this.profile.targetShieldTier, 2);
    for (let tier = maxTier; tier >= 1; tier--) {
      const cost = SHIELD_COSTS[tier - 1];
      const reserve = this.profile.shieldPriority === 2
        ? cost // ASAP: no reserve buffer
        : cost * BigInt(this.profile.reserveMultiplier);

      if (balance >= reserve) {
        this.log(`Purchasing T${tier} shield...`);
        try {
          await this.chain.purchaseShield(this.agentId, tier);
          this.log(`T${tier} shield purchased`);
        } catch (err) {
          this.log(`Shield purchase failed: ${err}`);
        }
        return;
      }
    }
  }

  // ─── Rig Repair ────────────────────────────────────────────────────

  private async maybeRepairRigs(): Promise<void> {
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
          this.log(`Rig ${rig.rigId} repaired`);
        } catch (err) {
          this.log(`Repair failed: ${err}`);
        }
      }
    }
  }

  // ─── Facility Maintenance ──────────────────────────────────────────

  private async maybeMaintainFacility(): Promise<void> {
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
          this.log(`Facility maintained — condition restored to 100%`);
        } catch (err) {
          this.log(`Facility maintenance failed: ${err}`);
        }
      }
    }
  }

  // ─── Cosmic Events ─────────────────────────────────────────────────

  private async maybeTriggerEvent(): Promise<void> {
    if (Math.random() > this.profile.eventTriggerRate) return;

    try {
      await this.chain.triggerEvent();
      this.log("Cosmic event triggered! Bounty earned.");
    } catch {
      // Expected to fail most times (cooldown, phase restrictions)
    }
  }

  private async maybeProcessEvents(): Promise<void> {
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
    // Only evaluate migration every ~10 cycles to avoid thrashing
    if (this.cycleCount % 10 !== 0) return;

    if (!this.chain.zoneManager) return;

    const balance = await this.chain.getBalance();
    // Need migration cost + reserve
    if (balance < MIGRATION_COST * BigInt(this.profile.reserveMultiplier)) return;

    const currentZone = Number(agent.zone);

    // Check current zone's conditions
    const currentModifier = await this.chain.getZoneMiningModifier(currentZone);
    const currentAgentCount = await this.chain.getZoneAgentCount(currentZone);

    // Evaluate each preferred migration target
    for (const targetZone of this.profile.migrationTargets) {
      if (targetZone === currentZone) continue;

      const targetModifier = await this.chain.getZoneMiningModifier(targetZone);
      const targetAgentCount = await this.chain.getZoneAgentCount(targetZone);

      // Score: higher modifier is better, fewer agents is better (less competition)
      const currentScore = currentModifier - Math.floor(currentAgentCount / 10);
      const targetScore = targetModifier - Math.floor(targetAgentCount / 10);

      // Migrate if target zone is significantly better (200 bps improvement)
      if (targetScore > currentScore + 200) {
        this.log(
          `Migrating from zone ${currentZone} to zone ${targetZone} ` +
          `(score ${currentScore} -> ${targetScore})...`
        );
        try {
          await this.chain.migrateZone(this.agentId, targetZone);
          this.log(`Migrated to zone ${targetZone}`);
          return; // One migration per evaluation
        } catch (err) {
          this.log(`Migration failed: ${err}`);
        }
      }
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

    // Build game state for context
    const ZONE_NAMES = [
      "The Solar Flats", "The Graviton Fields", "The Dark Forest",
      "The Nebula Depths", "The Kuiper Expanse", "The Trisolaran Reach",
      "The Pocket Rim", "The Singer Void",
    ];

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
      // Sabotage/marketplace context — populated when real agents submit events
      // For now these are empty; the API-integrated agents will fill them in
      sabotageAttacks: [],
      sabotageDefenses: [],
      recentDeals: [],
      marketplaceActivity: [],
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

      // Post to API if available
      try {
        await this.api.postSocialMessage?.(msg);
      } catch {
        // API post is best-effort
      }
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

  // ─── Utilities ─────────────────────────────────────────────────────

  private log(msg: string): void {
    const ts = new Date().toISOString().slice(11, 19);
    console.log(`[${ts}] ${msg}`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }
}
