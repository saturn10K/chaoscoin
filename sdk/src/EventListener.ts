import { ethers } from "ethers";

const COSMIC_ENGINE_ABI = [
  "event EventTriggered(uint256 indexed eventId, uint8 eventType, uint8 tier, uint8 originZone, uint8 affectedZonesMask, address triggeredBy)",
  "event EventProcessed(uint256 indexed eventId, uint256 agentsAffected, uint256 totalDamage)",
  "function nextEventId() external view returns (uint256)",
  "function lastEventBlock() external view returns (uint256)",
];

export interface CosmicEventData {
  eventId: number;
  eventType: number;
  tier: number;
  originZone: number;
  affectedZonesMask: number;
  triggeredBy: string;
  blockNumber: number;
}

export type EventCallback = (event: CosmicEventData) => void;

/**
 * Polls the chain for cosmic events and calls registered callbacks.
 */
export class EventListener {
  private provider: ethers.JsonRpcProvider;
  private cosmicEngine: ethers.Contract;
  private callbacks: EventCallback[] = [];
  private running = false;
  private lastCheckedBlock = 0;
  private pollInterval: number;

  constructor(
    rpcUrl: string,
    chainId: number,
    cosmicEngineAddress: string,
    pollInterval: number = 5000
  ) {
    this.provider = new ethers.JsonRpcProvider(rpcUrl, chainId);
    this.cosmicEngine = new ethers.Contract(
      cosmicEngineAddress,
      COSMIC_ENGINE_ABI,
      this.provider
    );
    this.pollInterval = pollInterval;
  }

  onEvent(callback: EventCallback): void {
    this.callbacks.push(callback);
  }

  async start(): Promise<void> {
    this.running = true;
    this.lastCheckedBlock = await this.provider.getBlockNumber();

    while (this.running) {
      try {
        await this.poll();
      } catch (err) {
        console.error("EventListener poll error:", err);
      }

      await new Promise((r) => setTimeout(r, this.pollInterval));
    }
  }

  stop(): void {
    this.running = false;
  }

  private async poll(): Promise<void> {
    const currentBlock = await this.provider.getBlockNumber();
    if (currentBlock <= this.lastCheckedBlock) return;

    const filter = this.cosmicEngine.filters.EventTriggered();
    const logs = await this.cosmicEngine.queryFilter(
      filter,
      this.lastCheckedBlock + 1,
      currentBlock
    );

    for (const log of logs) {
      const parsed = this.cosmicEngine.interface.parseLog({
        topics: log.topics as string[],
        data: log.data,
      });

      if (parsed) {
        const eventData: CosmicEventData = {
          eventId: Number(parsed.args[0]),
          eventType: Number(parsed.args[1]),
          tier: Number(parsed.args[2]),
          originZone: Number(parsed.args[3]),
          affectedZonesMask: Number(parsed.args[4]),
          triggeredBy: parsed.args[5],
          blockNumber: log.blockNumber,
        };

        for (const cb of this.callbacks) {
          try {
            cb(eventData);
          } catch (err) {
            console.error("Event callback error:", err);
          }
        }
      }
    }

    this.lastCheckedBlock = currentBlock;
  }
}
