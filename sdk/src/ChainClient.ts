import { ethers } from "ethers";

/** Minimal ABIs for direct contract interaction */
const ABIS = {
  agentRegistry: [
    "function heartbeat(uint256 agentId) external",
    "function getAgent(uint256 agentId) external view returns (tuple(uint256 agentId, bytes32 moltbookIdHash, address operator, uint256 hashrate, uint8 zone, uint256 cosmicResilience, uint8 shieldLevel, uint256 lastHeartbeat, uint256 registrationBlock, uint8 pioneerPhase, uint256 rewardDebt, uint256 totalMined, bool active))",
    "function isActive(uint256 agentId) external view returns (bool)",
    "function activeAgentCount() external view returns (uint256)",
    "function getGenesisPhase() external view returns (uint8)",
    "function agentByOperator(address) external view returns (uint256)",
  ],
  miningEngine: [
    "function claimRewards(uint256 agentId) external returns (uint256)",
    "function getPendingRewards(uint256 agentId) external view returns (uint256)",
    "function calculateAdaptiveEmission() external view returns (uint256)",
    "function totalEffectiveHashrate() external view returns (uint256)",
  ],
  rigFactory: [
    "function purchaseRig(uint256 agentId, uint8 tier) external",
    "function equipRig(uint256 rigId) external",
    "function repairRig(uint256 rigId) external",
    "function getAgentRigs(uint256 agentId) external view returns (uint256[])",
    "function getRig(uint256 rigId) external view returns (tuple(uint8 tier, uint256 baseHashrate, uint16 powerDraw, uint256 durability, uint256 maxDurability, uint256 ownerAgentId, bool active))",
    "function calculateEffectiveHashrate(uint256 agentId) external view returns (uint256)",
    "function getUsedPower(uint256 agentId) external view returns (uint32)",
    "function getActiveRigCount(uint256 agentId) external view returns (uint256)",
    "function getEffectiveCost(uint8 tier) external view returns (uint256)",
    "function totalRigsByTier(uint256 tier) external view returns (uint256)",
  ],
  facilityManager: [
    "function upgrade(uint256 agentId) external",
    "function maintainFacility(uint256 agentId) external",
    "function getFacility(uint256 agentId) external view returns (tuple(uint8 level, uint8 slots, uint32 powerOutput, uint8 shelterRating, uint256 condition, uint256 maxCondition))",
    "function getPowerOutput(uint256 agentId) external view returns (uint32)",
    "function getShelterRating(uint256 agentId) external view returns (uint8)",
  ],
  shieldManager: [
    "function purchaseShield(uint256 agentId, uint8 tier) external",
    "function activateShield(uint256 agentId) external",
    "function getShield(uint256 agentId) external view returns (tuple(uint8 tier, uint8 absorption, uint8 charges, bool active))",
  ],
  chaosToken: [
    "function approve(address spender, uint256 amount) external returns (bool)",
    "function balanceOf(address account) external view returns (uint256)",
    "function allowance(address owner, address spender) external view returns (uint256)",
  ],
  cosmicEngine: [
    "function triggerEvent() external returns (uint256)",
    "function processEvent(uint256 eventId) external",
    "function nextEventId() external view returns (uint256)",
    "function lastEventBlock() external view returns (uint256)",
    "function getEvent(uint256 eventId) external view returns (tuple(uint256 eventId, uint8 eventType, uint8 severityTier, uint256 baseDamage, uint8 originZone, uint8 affectedZonesMask, uint256 triggerBlock, address triggeredBy, bool processed))",
  ],
  zoneManager: [
    "function migrate(uint256 agentId, uint8 targetZone) external",
    "function getZoneMiningModifier(uint8 zone) external view returns (int16)",
    "function getZoneAgentCount(uint8 zone) external view returns (uint256)",
    "function getZoneDamageMultiplier(uint8 zone, uint8 eventType) external view returns (uint16)",
  ],
  marketplace: [
    "function listRig(uint256 agentId, uint256 rigId, uint256 price) external",
    "function buyRig(uint256 listingId, uint256 buyerAgentId) external",
    "function cancelListing(uint256 listingId) external",
    "function getListing(uint256 listingId) external view returns (tuple(uint256 rigId, uint256 sellerAgentId, uint256 price, bool active))",
    "function getActiveListingForRig(uint256 rigId) external view returns (uint256, tuple(uint256 rigId, uint256 sellerAgentId, uint256 price, bool active))",
    "function nextListingId() external view returns (uint256)",
  ],
  sabotage: [
    "function facilityRaid(uint256 attackerAgent, uint256 targetAgent) external",
    "function rigJam(uint256 attackerAgent, uint256 targetAgent) external",
    "function gatherIntel(uint256 attackerAgent, uint256 targetAgent) external",
    "function getCooldownRemaining(uint256 attackerAgent, uint256 targetAgent) external view returns (uint256)",
    "function totalFacilityRaids() external view returns (uint256)",
    "function totalRigJams() external view returns (uint256)",
    "function totalIntelOps() external view returns (uint256)",
    "function totalBurnedBySabotage() external view returns (uint256)",
  ],
};

export interface ContractAddresses {
  chaosToken: string;
  agentRegistry: string;
  miningEngine: string;
  rigFactory: string;
  facilityManager: string;
  shieldManager: string;
  cosmicEngine: string;
  zoneManager?: string;
  marketplace?: string;
  sabotage?: string;
}

export interface ChainClientConfig {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  addresses: ContractAddresses;
}

/**
 * Direct ethers.js contract calls for agents.
 * Agents use this to interact with contracts directly using their own EOA.
 */
export class ChainClient {
  public provider: ethers.JsonRpcProvider;
  public wallet: ethers.Wallet;
  public addresses: ContractAddresses;

  public agentRegistry: ethers.Contract;
  public miningEngine: ethers.Contract;
  public rigFactory: ethers.Contract;
  public facilityManager: ethers.Contract;
  public shieldManager: ethers.Contract;
  public chaosToken: ethers.Contract;
  public cosmicEngine: ethers.Contract;
  public zoneManager: ethers.Contract | null;
  public marketplace: ethers.Contract | null;
  public sabotageContract: ethers.Contract | null;

  constructor(config: ChainClientConfig) {
    // Use static network to avoid unnecessary eth_chainId calls (helps with rate limits)
    const staticNetwork = new ethers.Network("monad-testnet", config.chainId);
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl, staticNetwork, {
      staticNetwork,
      batchMaxCount: 1,
      pollingInterval: 30_000,
    });
    this.wallet = new ethers.Wallet(config.privateKey, this.provider);
    this.addresses = config.addresses;

    this.agentRegistry = new ethers.Contract(
      config.addresses.agentRegistry,
      ABIS.agentRegistry,
      this.wallet
    );
    this.miningEngine = new ethers.Contract(
      config.addresses.miningEngine,
      ABIS.miningEngine,
      this.wallet
    );
    this.rigFactory = new ethers.Contract(
      config.addresses.rigFactory,
      ABIS.rigFactory,
      this.wallet
    );
    this.facilityManager = new ethers.Contract(
      config.addresses.facilityManager,
      ABIS.facilityManager,
      this.wallet
    );
    this.shieldManager = new ethers.Contract(
      config.addresses.shieldManager,
      ABIS.shieldManager,
      this.wallet
    );
    this.chaosToken = new ethers.Contract(
      config.addresses.chaosToken,
      ABIS.chaosToken,
      this.wallet
    );
    this.cosmicEngine = new ethers.Contract(
      config.addresses.cosmicEngine,
      ABIS.cosmicEngine,
      this.wallet
    );
    this.zoneManager = config.addresses.zoneManager
      ? new ethers.Contract(
          config.addresses.zoneManager,
          ABIS.zoneManager,
          this.wallet
        )
      : null;
    this.marketplace = config.addresses.marketplace
      ? new ethers.Contract(
          config.addresses.marketplace,
          ABIS.marketplace,
          this.wallet
        )
      : null;
    this.sabotageContract = config.addresses.sabotage
      ? new ethers.Contract(
          config.addresses.sabotage,
          ABIS.sabotage,
          this.wallet
        )
      : null;
  }

  get address(): string {
    return this.wallet.address;
  }

  // === Heartbeat ===

  async heartbeat(agentId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.agentRegistry.heartbeat(agentId);
    return tx.wait();
  }

  // === Mining ===

  async claimRewards(agentId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.miningEngine.claimRewards(agentId);
    return tx.wait();
  }

  async getPendingRewards(agentId: number): Promise<bigint> {
    return this.miningEngine.getPendingRewards(agentId);
  }

  // === Equipment ===

  async approveSpending(
    spender: string,
    amount: bigint = ethers.MaxUint256
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.chaosToken.approve(spender, amount);
    return tx.wait();
  }

  async purchaseRig(
    agentId: number,
    tier: number
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.rigFactory.purchaseRig(agentId, tier);
    return tx.wait();
  }

  async equipRig(rigId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.rigFactory.equipRig(rigId);
    return tx.wait();
  }

  async repairRig(rigId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.rigFactory.repairRig(rigId);
    return tx.wait();
  }

  async upgradeFacility(agentId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.facilityManager.upgrade(agentId);
    return tx.wait();
  }

  async maintainFacility(agentId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.facilityManager.maintainFacility(agentId);
    return tx.wait();
  }

  async purchaseShield(
    agentId: number,
    tier: number
  ): Promise<ethers.TransactionReceipt> {
    const tx = await this.shieldManager.purchaseShield(agentId, tier);
    return tx.wait();
  }

  async activateShield(agentId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.shieldManager.activateShield(agentId);
    return tx.wait();
  }

  // === Zone Migration ===

  async migrateZone(
    agentId: number,
    targetZone: number
  ): Promise<ethers.TransactionReceipt> {
    if (!this.zoneManager) throw new Error("ZoneManager address not configured");
    const tx = await this.zoneManager.migrate(agentId, targetZone);
    return tx.wait();
  }

  async getZoneMiningModifier(zone: number): Promise<number> {
    if (!this.zoneManager) return 0;
    return Number(await this.zoneManager.getZoneMiningModifier(zone));
  }

  async getZoneAgentCount(zone: number): Promise<number> {
    if (!this.zoneManager) return 0;
    return Number(await this.zoneManager.getZoneAgentCount(zone));
  }

  // === Cosmic Events ===

  async triggerEvent(): Promise<ethers.TransactionReceipt> {
    const tx = await this.cosmicEngine.triggerEvent();
    return tx.wait();
  }

  async processEvent(eventId: number): Promise<ethers.TransactionReceipt> {
    const tx = await this.cosmicEngine.processEvent(eventId);
    return tx.wait();
  }

  async getNextEventId(): Promise<number> {
    return Number(await this.cosmicEngine.nextEventId());
  }

  async getLastEventBlock(): Promise<number> {
    return Number(await this.cosmicEngine.lastEventBlock());
  }

  async getCosmicEvent(eventId: number): Promise<any> {
    return this.cosmicEngine["getEvent(uint256)"](eventId);
  }

  // === Views ===

  async getBalance(): Promise<bigint> {
    return this.chaosToken.balanceOf(this.address);
  }

  async getAgentId(): Promise<number> {
    const id = await this.agentRegistry.agentByOperator(this.address);
    return Number(id);
  }

  async getAgent(agentId: number): Promise<any> {
    return this.agentRegistry.getAgent(agentId);
  }

  async getRigs(agentId: number): Promise<any[]> {
    const rigIds: bigint[] = await this.rigFactory.getAgentRigs(agentId);
    const rigs = [];
    for (const id of rigIds) {
      if (id === 0n) continue;
      const rig = await this.rigFactory.getRig(id);
      rigs.push({ rigId: Number(id), ...rig });
    }
    return rigs;
  }

  async getUsedPower(agentId: number): Promise<number> {
    return Number(await this.rigFactory.getUsedPower(agentId));
  }

  async getActiveRigCount(agentId: number): Promise<number> {
    return Number(await this.rigFactory.getActiveRigCount(agentId));
  }

  async getFacility(agentId: number): Promise<any> {
    return this.facilityManager.getFacility(agentId);
  }

  async getShield(agentId: number): Promise<any> {
    return this.shieldManager.getShield(agentId);
  }

  // === Dynamic Pricing ===

  async getEffectiveRigCost(tier: number): Promise<bigint> {
    return this.rigFactory.getEffectiveCost(tier);
  }

  async getTotalRigsByTier(tier: number): Promise<number> {
    return Number(await this.rigFactory.totalRigsByTier(tier));
  }

  // === Marketplace ===

  async listRig(agentId: number, rigId: number, price: bigint): Promise<ethers.TransactionReceipt> {
    if (!this.marketplace) throw new Error("Marketplace not configured");
    const tx = await this.marketplace.listRig(agentId, rigId, price);
    return tx.wait();
  }

  async buyRig(listingId: number, buyerAgentId: number): Promise<ethers.TransactionReceipt> {
    if (!this.marketplace) throw new Error("Marketplace not configured");
    const tx = await this.marketplace.buyRig(listingId, buyerAgentId);
    return tx.wait();
  }

  async cancelListing(listingId: number): Promise<ethers.TransactionReceipt> {
    if (!this.marketplace) throw new Error("Marketplace not configured");
    const tx = await this.marketplace.cancelListing(listingId);
    return tx.wait();
  }

  async getListing(listingId: number): Promise<any> {
    if (!this.marketplace) throw new Error("Marketplace not configured");
    return this.marketplace.getListing(listingId);
  }

  // === Sabotage ===

  async facilityRaid(attackerAgent: number, targetAgent: number): Promise<ethers.TransactionReceipt> {
    if (!this.sabotageContract) throw new Error("Sabotage not configured");
    const tx = await this.sabotageContract.facilityRaid(attackerAgent, targetAgent);
    return tx.wait();
  }

  async rigJam(attackerAgent: number, targetAgent: number): Promise<ethers.TransactionReceipt> {
    if (!this.sabotageContract) throw new Error("Sabotage not configured");
    const tx = await this.sabotageContract.rigJam(attackerAgent, targetAgent);
    return tx.wait();
  }

  async gatherIntel(attackerAgent: number, targetAgent: number): Promise<ethers.TransactionReceipt> {
    if (!this.sabotageContract) throw new Error("Sabotage not configured");
    const tx = await this.sabotageContract.gatherIntel(attackerAgent, targetAgent);
    return tx.wait();
  }

  async getSabotageCooldown(attackerAgent: number, targetAgent: number): Promise<number> {
    if (!this.sabotageContract) throw new Error("Sabotage not configured");
    return Number(await this.sabotageContract.getCooldownRemaining(attackerAgent, targetAgent));
  }

  async getSabotageStats(): Promise<{
    totalFacilityRaids: number;
    totalRigJams: number;
    totalIntelOps: number;
    totalBurnedBySabotage: bigint;
  }> {
    if (!this.sabotageContract) throw new Error("Sabotage not configured");
    const [raids, jams, intel, burned] = await Promise.all([
      this.sabotageContract.totalFacilityRaids(),
      this.sabotageContract.totalRigJams(),
      this.sabotageContract.totalIntelOps(),
      this.sabotageContract.totalBurnedBySabotage(),
    ]);
    return {
      totalFacilityRaids: Number(raids),
      totalRigJams: Number(jams),
      totalIntelOps: Number(intel),
      totalBurnedBySabotage: BigInt(burned),
    };
  }
}
