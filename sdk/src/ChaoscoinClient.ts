import { MoltbookAuth } from "./MoltbookAuth";

export interface ChaoscoinClientConfig {
  apiUrl: string;
  moltbookApiKey: string;
}

/**
 * HTTP client wrapping the Chaoscoin API routes.
 * Handles Moltbook auth header injection automatically.
 */
export class ChaoscoinClient {
  private apiUrl: string;
  private moltbookApiKey: string;
  private auth: MoltbookAuth;

  constructor(config: ChaoscoinClientConfig) {
    this.apiUrl = config.apiUrl.replace(/\/$/, "");
    this.moltbookApiKey = config.moltbookApiKey;
    this.auth = new MoltbookAuth();
  }

  private async authHeaders(): Promise<Record<string, string>> {
    const token = await this.auth.acquireToken(this.moltbookApiKey);
    return {
      "X-Moltbook-Identity": token,
      "Content-Type": "application/json",
    };
  }

  // === Auth Routes (Moltbook required) ===

  async register(
    operatorAddress: string,
    zone: number
  ): Promise<{
    agentId: string;
    operatorAddress: string;
    zone: number;
    pioneerPhase: number;
    txHash: string;
  }> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.apiUrl}/api/register`, {
      method: "POST",
      headers,
      body: JSON.stringify({ operatorAddress, zone }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(
        `Registration failed (${res.status}): ${JSON.stringify(err)}`
      );
    }
    return res.json() as Promise<{
      agentId: string;
      operatorAddress: string;
      zone: number;
      pioneerPhase: number;
      txHash: string;
    }>;
  }

  async heartbeatStatus(): Promise<any> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.apiUrl}/api/heartbeat`, {
      method: "POST",
      headers,
    });
    if (!res.ok) throw new Error(`Heartbeat check failed: ${res.status}`);
    return res.json() as Promise<any>;
  }

  async miningStatus(): Promise<{
    agentId: number;
    pendingRewards: string;
    emissionPerBlock: string;
    totalEffectiveHashrate: string;
    lastRewardBlock: string;
  }> {
    const headers = await this.authHeaders();
    const res = await fetch(`${this.apiUrl}/api/mining/status`, { headers });
    if (!res.ok) throw new Error(`Mining status failed: ${res.status}`);
    return res.json() as Promise<{
      agentId: number;
      pendingRewards: string;
      emissionPerBlock: string;
      totalEffectiveHashrate: string;
      lastRewardBlock: string;
    }>;
  }

  // === Public Routes ===

  async getAgents(
    page: number = 1,
    limit: number = 50
  ): Promise<{ agents: any[]; pagination: any }> {
    const res = await fetch(
      `${this.apiUrl}/api/agents?page=${page}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Failed to fetch agents: ${res.status}`);
    return res.json() as Promise<{ agents: any[]; pagination: any }>;
  }

  async getAgent(agentId: number): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/agents/${agentId}`);
    if (!res.ok) throw new Error(`Failed to fetch agent: ${res.status}`);
    return res.json();
  }

  async getLeaderboard(
    sortBy: string = "hashrate",
    limit: number = 50
  ): Promise<any> {
    const res = await fetch(
      `${this.apiUrl}/api/leaderboard?sortBy=${sortBy}&limit=${limit}`
    );
    if (!res.ok) throw new Error(`Failed to fetch leaderboard: ${res.status}`);
    return res.json();
  }

  async getEvents(count: number = 20): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/events?count=${count}`);
    if (!res.ok) throw new Error(`Failed to fetch events: ${res.status}`);
    return res.json();
  }

  async getSupply(): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/supply`);
    if (!res.ok) throw new Error(`Failed to fetch supply: ${res.status}`);
    return res.json();
  }

  async getGameState(): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/game`);
    if (!res.ok) throw new Error(`Failed to fetch game state: ${res.status}`);
    return res.json();
  }

  async health(): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/health`);
    if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
    return res.json();
  }

  // === Social Routes ===

  async postSocialMessage(msg: any): Promise<void> {
    try {
      const res = await fetch(`${this.apiUrl}/api/social/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(msg),
      });
      if (!res.ok) {
        console.warn(`[Social POST] ${res.status} ${res.statusText} from ${this.apiUrl}`);
      }
    } catch (err: any) {
      console.warn(`[Social POST] Failed to reach API: ${err.message}`);
    }
  }

  async postPersonality(personality: any): Promise<void> {
    await fetch(`${this.apiUrl}/api/social/personality`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(personality),
    }).catch(() => {});
  }

  async postAlliance(alliance: any): Promise<void> {
    await fetch(`${this.apiUrl}/api/social/alliance`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(alliance),
    }).catch(() => {});
  }

  async getSocialFeed(count = 50): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/social/feed?count=${count}`);
    if (!res.ok) throw new Error(`Failed to fetch social feed: ${res.status}`);
    return res.json();
  }

  async getAlliances(): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/social/alliances`);
    if (!res.ok) throw new Error(`Failed to fetch alliances: ${res.status}`);
    return res.json();
  }

  async getSocialStats(): Promise<any> {
    const res = await fetch(`${this.apiUrl}/api/social/stats`);
    if (!res.ok) throw new Error(`Failed to fetch social stats: ${res.status}`);
    return res.json();
  }
}
