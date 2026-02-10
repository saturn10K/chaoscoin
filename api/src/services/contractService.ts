import { ethers } from "ethers";
import { config } from "../config";
import { AgentProfile, SupplyMetrics, CosmicEvent } from "../types";

// Minimal ABIs — only the functions we call from the API
const AGENT_REGISTRY_ABI = [
  "function register(address operator, bytes32 moltbookIdHash, uint8 zone) external returns (uint256)",
  "function heartbeat(uint256 agentId) external",
  "function getAgent(uint256 agentId) external view returns (tuple(uint256 agentId, bytes32 moltbookIdHash, address operator, uint256 hashrate, uint8 zone, uint256 cosmicResilience, uint8 shieldLevel, uint256 lastHeartbeat, uint256 registrationBlock, uint8 pioneerPhase, uint256 rewardDebt, uint256 totalMined, bool active))",
  "function agentByOperator(address operator) external view returns (uint256)",
  "function agentByMoltbookId(bytes32 hash) external view returns (uint256)",
  "function activeAgentCount() external view returns (uint256)",
  "function nextAgentId() external view returns (uint256)",
  "function getGenesisPhase() external view returns (uint8)",
  "function isActive(uint256 agentId) external view returns (bool)",
  "function getPioneerBonus(uint256 agentId) external view returns (uint256)",
];

const MINING_ENGINE_ABI = [
  "function claimRewards(uint256 agentId) external returns (uint256)",
  "function updateAccumulator() external",
  "function getPendingRewards(uint256 agentId) external view returns (uint256)",
  "function accRewardPerHash() external view returns (uint256)",
  "function totalEffectiveHashrate() external view returns (uint256)",
  "function lastRewardBlock() external view returns (uint256)",
  "function calculateAdaptiveEmission() external view returns (uint256)",
];

const CHAOS_TOKEN_ABI = [
  "function totalSupply() external view returns (uint256)",
  "function totalMinted() external view returns (uint256)",
  "function totalBurned() external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
];

const TOKEN_BURNER_ABI = [
  "function burnsBySource(uint8 source) external view returns (uint256)",
  "function cumulativeBurned() external view returns (uint256)",
];

const ERA_MANAGER_ABI = [
  "function getCurrentEra() external view returns (uint8)",
  "function getCurrentModifier() external view returns (uint256)",
  "function getMaxEventTier() external view returns (uint8)",
  "function getEventCooldown() external view returns (uint256)",
];

const ZONE_MANAGER_ABI = [
  "function getZoneAgentCount(uint8 zone) external view returns (uint256)",
  "function getZoneMiningModifier(uint8 zone) external view returns (int16)",
];

const COSMIC_ENGINE_ABI = [
  "function getEvent(uint256 eventId) external view returns (tuple(uint256 eventId, uint8 eventType, uint8 severityTier, uint256 baseDamage, uint8 originZone, uint8 affectedZonesMask, uint256 triggerBlock, address triggeredBy, bool processed))",
  "function nextEventId() external view returns (uint256)",
  "function lastEventBlock() external view returns (uint256)",
];

const RIG_FACTORY_ABI = [
  "function getAgentRigs(uint256 agentId) external view returns (uint256[])",
  "function getRig(uint256 rigId) external view returns (tuple(uint8 tier, uint256 baseHashrate, uint16 powerDraw, uint256 durability, uint256 maxDurability, uint256 ownerAgentId, bool active))",
  "function calculateEffectiveHashrate(uint256 agentId) external view returns (uint256)",
];

const FACILITY_MANAGER_ABI = [
  "function getFacility(uint256 agentId) external view returns (tuple(uint8 level, uint8 slots, uint32 powerOutput, uint8 shelterRating))",
];

const SHIELD_MANAGER_ABI = [
  "function getShield(uint256 agentId) external view returns (tuple(uint8 tier, uint8 absorption, uint8 charges, bool active))",
];

// ── ERC-8004 Trustless Agents ───────────────────────────────────────────────

const ERC8004_IDENTITY_ABI = [
  "function registerAgent(address agentAddress, string agentURI) external returns (uint256)",
  "function ownerOf(uint256 tokenId) external view returns (address)",
  "function tokenURI(uint256 tokenId) external view returns (string)",
  "event AgentRegistered(uint256 indexed agentId, address indexed agentAddress, string agentURI)",
];

const ERC8004_REPUTATION_ABI = [
  "function giveFeedback(uint256 agentId, int128 value, uint8 decimals, string tag1, string tag2, string endpoint, string feedbackURI, bytes32 hash) external",
  "function getSummary(uint256 agentId, address[] clients, string tag1, string tag2) external view returns (uint256 count, int256 value, uint8 decimals)",
];

let provider: ethers.JsonRpcProvider;
let registrarWallet: ethers.Wallet;
let contracts: ReturnType<typeof initContracts>;

function initContracts() {
  provider = new ethers.JsonRpcProvider(config.rpcUrl, config.chainId);
  registrarWallet = new ethers.Wallet(config.registrarPrivateKey, provider);

  return {
    agentRegistry: new ethers.Contract(
      config.contracts.agentRegistry,
      AGENT_REGISTRY_ABI,
      registrarWallet
    ),
    miningEngine: new ethers.Contract(
      config.contracts.miningEngine,
      MINING_ENGINE_ABI,
      provider
    ),
    chaosToken: new ethers.Contract(
      config.contracts.chaosToken,
      CHAOS_TOKEN_ABI,
      provider
    ),
    tokenBurner: new ethers.Contract(
      config.contracts.tokenBurner,
      TOKEN_BURNER_ABI,
      provider
    ),
    eraManager: new ethers.Contract(
      config.contracts.eraManager,
      ERA_MANAGER_ABI,
      provider
    ),
    zoneManager: new ethers.Contract(
      config.contracts.zoneManager,
      ZONE_MANAGER_ABI,
      provider
    ),
    cosmicEngine: new ethers.Contract(
      config.contracts.cosmicEngine,
      COSMIC_ENGINE_ABI,
      provider
    ),
    rigFactory: new ethers.Contract(
      config.contracts.rigFactory,
      RIG_FACTORY_ABI,
      provider
    ),
    facilityManager: new ethers.Contract(
      config.contracts.facilityManager,
      FACILITY_MANAGER_ABI,
      provider
    ),
    shieldManager: new ethers.Contract(
      config.contracts.shieldManager,
      SHIELD_MANAGER_ABI,
      provider
    ),

    // ERC-8004 Trustless Agents (registrar signs these txs)
    erc8004Identity: new ethers.Contract(
      config.contracts.erc8004Identity,
      ERC8004_IDENTITY_ABI,
      registrarWallet
    ),
    erc8004Reputation: new ethers.Contract(
      config.contracts.erc8004Reputation,
      ERC8004_REPUTATION_ABI,
      registrarWallet
    ),
  };
}

export function getContracts() {
  if (!contracts) contracts = initContracts();
  return contracts;
}

export function getRegistrarWallet() {
  if (!registrarWallet) initContracts();
  return registrarWallet;
}

// === Registration ===

export async function registerAgent(
  operatorAddress: string,
  moltbookId: string,
  zone: number
): Promise<{ agentId: bigint; txHash: string }> {
  const c = getContracts();
  const moltbookIdHash = ethers.keccak256(
    ethers.toUtf8Bytes(moltbookId)
  );

  const tx = await c.agentRegistry.register(
    operatorAddress,
    moltbookIdHash,
    zone
  );
  const receipt = await tx.wait();

  // Parse AgentRegistered event
  const iface = new ethers.Interface(AGENT_REGISTRY_ABI.concat([
    "event AgentRegistered(uint256 indexed agentId, address indexed operator, bytes32 moltbookIdHash, uint8 zone, uint8 pioneerPhase)",
  ]));
  const log = receipt.logs.find((l: ethers.Log) => {
    try {
      iface.parseLog({ topics: l.topics as string[], data: l.data });
      return true;
    } catch {
      return false;
    }
  });

  let agentId = 0n;
  if (log) {
    const parsed = iface.parseLog({
      topics: log.topics as string[],
      data: log.data,
    });
    agentId = parsed?.args[0] ?? 0n;
  }

  return { agentId, txHash: receipt.hash };
}

// === Agent Queries ===

export async function getAgent(
  agentId: number
): Promise<AgentProfile | null> {
  const c = getContracts();
  try {
    const agent = await c.agentRegistry.getAgent(agentId);
    if (agent.agentId === 0n) return null;

    return {
      agentId: agent.agentId.toString(),
      operator: agent.operator,
      moltbookIdHash: agent.moltbookIdHash,
      hashrate: agent.hashrate.toString(),
      zone: Number(agent.zone),
      cosmicResilience: agent.cosmicResilience.toString(),
      shieldLevel: Number(agent.shieldLevel),
      lastHeartbeat: agent.lastHeartbeat.toString(),
      registrationBlock: agent.registrationBlock.toString(),
      pioneerPhase: Number(agent.pioneerPhase),
      totalMined: agent.totalMined.toString(),
      active: agent.active,
    };
  } catch {
    return null;
  }
}

export async function getAgentByOperator(
  operator: string
): Promise<number> {
  const c = getContracts();
  const id = await c.agentRegistry.agentByOperator(operator);
  return Number(id);
}

export async function getAgentByMoltbookId(
  moltbookId: string
): Promise<number> {
  const c = getContracts();
  const hash = ethers.keccak256(ethers.toUtf8Bytes(moltbookId));
  const id = await c.agentRegistry.agentByMoltbookId(hash);
  return Number(id);
}

export async function getAgentList(
  page: number = 1,
  limit: number = 50
): Promise<{ agents: AgentProfile[]; total: number }> {
  const c = getContracts();
  const nextId = Number(await c.agentRegistry.nextAgentId());
  const total = nextId - 1;

  const start = (page - 1) * limit + 1;
  const end = Math.min(start + limit, nextId);
  const agents: AgentProfile[] = [];

  for (let i = start; i < end; i++) {
    const agent = await getAgent(i);
    if (agent) agents.push(agent);
  }

  return { agents, total };
}

// === Mining ===

export async function getMiningStatus(agentId: number) {
  const c = getContracts();
  const [pending, emission, totalHash, lastBlock] = await Promise.all([
    c.miningEngine.getPendingRewards(agentId),
    c.miningEngine.calculateAdaptiveEmission(),
    c.miningEngine.totalEffectiveHashrate(),
    c.miningEngine.lastRewardBlock(),
  ]);

  return {
    pendingRewards: pending.toString(),
    emissionPerBlock: emission.toString(),
    totalEffectiveHashrate: totalHash.toString(),
    lastRewardBlock: lastBlock.toString(),
  };
}

// === Supply ===

export async function getSupplyMetrics(): Promise<SupplyMetrics> {
  const c = getContracts();
  const [totalMinted, totalBurned, totalSupply] = await Promise.all([
    c.chaosToken.totalMinted(),
    c.chaosToken.totalBurned(),
    c.chaosToken.totalSupply(),
  ]);

  const [mining, rigPurchase, facilityUpgrade, rigRepair, shieldPurchase] =
    await Promise.all([
      c.tokenBurner.burnsBySource(0),
      c.tokenBurner.burnsBySource(1),
      c.tokenBurner.burnsBySource(2),
      c.tokenBurner.burnsBySource(3),
      c.tokenBurner.burnsBySource(4),
    ]);

  const burned = BigInt(totalBurned);
  const minted = BigInt(totalMinted);
  const burnRatio = minted > 0n ? Number((burned * 10000n) / minted) / 100 : 0;

  return {
    totalMinted: totalMinted.toString(),
    totalBurned: totalBurned.toString(),
    circulatingSupply: totalSupply.toString(),
    burnRatio,
    burnsBySource: {
      mining: mining.toString(),
      rigPurchase: rigPurchase.toString(),
      facilityUpgrade: facilityUpgrade.toString(),
      rigRepair: rigRepair.toString(),
      shieldPurchase: shieldPurchase.toString(),
    },
  };
}

// === Events ===

export async function getRecentEvents(
  count: number = 20
): Promise<CosmicEvent[]> {
  const c = getContracts();
  const nextId = Number(await c.cosmicEngine.nextEventId());
  const events: CosmicEvent[] = [];

  const start = Math.max(1, nextId - count);
  for (let i = nextId - 1; i >= start; i--) {
    try {
      const evt: any = await (c.cosmicEngine as any).getEvent(BigInt(i));
      if (evt.eventId > 0n) {
        events.push({
          eventId: evt.eventId.toString(),
          eventType: Number(evt.eventType),
          severityTier: Number(evt.severityTier),
          baseDamage: evt.baseDamage.toString(),
          originZone: Number(evt.originZone),
          affectedZonesMask: Number(evt.affectedZonesMask),
          triggerBlock: evt.triggerBlock.toString(),
          triggeredBy: evt.triggeredBy,
          processed: evt.processed,
        });
      }
    } catch {
      // Skip invalid event IDs
    }
  }

  return events;
}

// === ERC-8004 Identity ===

// In-memory mapping: chaoscoinAgentId → erc8004AgentId
const erc8004AgentMap = new Map<number, number>();

export function getERC8004AgentId(chaoscoinAgentId: number): number | null {
  return erc8004AgentMap.get(chaoscoinAgentId) ?? null;
}

export async function registerERC8004Agent(
  agentName: string,
  chaoscoinAgentId: number,
  zone: number,
  operatorAddress: string
): Promise<{ erc8004AgentId: bigint; txHash: string }> {
  const c = getContracts();

  // Build agent metadata as a data: URI (fully on-chain, no IPFS dependency)
  const agentCard = {
    name: agentName || `Agent #${chaoscoinAgentId}`,
    description: `Chaoscoin mining agent #${chaoscoinAgentId}`,
    game: "chaoscoin",
    chaoscoinAgentId,
    zone,
    operatorAddress,
    endpoints: {
      api: "https://chaoscoin-production.up.railway.app",
      dashboard: "https://chaoscoin.fun",
    },
    protocols: ["chaoscoin-mining-v1"],
    registeredAt: Date.now(),
  };

  const agentURI = `data:application/json;base64,${Buffer.from(
    JSON.stringify(agentCard)
  ).toString("base64")}`;

  // Register on ERC-8004 IdentityRegistry
  const tx = await c.erc8004Identity.registerAgent(operatorAddress, agentURI);
  const receipt = await tx.wait();

  // Parse AgentRegistered event to get the ERC-8004 agentId
  const iface = new ethers.Interface(ERC8004_IDENTITY_ABI);
  let erc8004AgentId = 0n;

  for (const log of receipt.logs) {
    try {
      const parsed = iface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });
      if (parsed?.name === "AgentRegistered") {
        erc8004AgentId = parsed.args[0];
        break;
      }
    } catch {
      // Not our event, skip
    }
  }

  // Store mapping
  if (erc8004AgentId > 0n) {
    erc8004AgentMap.set(chaoscoinAgentId, Number(erc8004AgentId));
  }

  return { erc8004AgentId, txHash: receipt.hash };
}

// === Era / Zone ===

export async function getGameState() {
  const c = getContracts();
  const [era, modifier, maxTier, cooldown, activeCount, genesisPhase] =
    await Promise.all([
      c.eraManager.getCurrentEra(),
      c.eraManager.getCurrentModifier(),
      c.eraManager.getMaxEventTier(),
      c.eraManager.getEventCooldown(),
      c.agentRegistry.activeAgentCount(),
      c.agentRegistry.getGenesisPhase(),
    ]);

  const zoneCounts: number[] = [];
  for (let z = 0; z < 8; z++) {
    const count = await c.zoneManager.getZoneAgentCount(z);
    zoneCounts.push(Number(count));
  }

  const lastEventBlock = await c.cosmicEngine.lastEventBlock();

  return {
    era: Number(era),
    eraModifier: modifier.toString(),
    maxEventTier: Number(maxTier),
    eventCooldown: Number(cooldown),
    activeAgentCount: Number(activeCount),
    genesisPhase: Number(genesisPhase),
    zoneCounts,
    lastEventBlock: lastEventBlock.toString(),
  };
}
