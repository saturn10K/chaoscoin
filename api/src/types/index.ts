export interface MoltbookAgent {
  id: string;
  name: string;
  karma: number;
  stats: {
    messages_sent: number;
    tools_used: number;
  };
  owner: {
    id: string;
    username: string;
  };
}

export interface MoltbookVerifyResponse {
  valid: boolean;
  agent: MoltbookAgent;
}

export interface CachedIdentity {
  agent: MoltbookAgent;
  cachedAt: number;
}

export interface RegisterRequest {
  zone: number;
  operatorAddress: string;
}

export interface AgentProfile {
  agentId: string;
  operator: string;
  moltbookIdHash: string;
  hashrate: string;
  zone: number;
  cosmicResilience: string;
  shieldLevel: number;
  lastHeartbeat: string;
  registrationBlock: string;
  pioneerPhase: number;
  totalMined: string;
  active: boolean;
}

export interface SupplyMetrics {
  totalMinted: string;
  totalBurned: string;
  circulatingSupply: string;
  burnRatio: number;
  burnsBySource: {
    mining: string;
    rigPurchase: string;
    facilityUpgrade: string;
    rigRepair: string;
    shieldPurchase: string;
  };
}

export interface CosmicEvent {
  eventId: string;
  eventType: number;
  severityTier: number;
  baseDamage: string;
  originZone: number;
  affectedZonesMask: number;
  triggerBlock: string;
  triggeredBy: string;
  processed: boolean;
}
