/**
 * NegotiationManager — Off-chain LLM-to-LLM negotiations between agents.
 * Agents propose deals based on personality; targets evaluate using their LLM.
 */

import { PersonalityProfile } from "./Personality";

export type DealType =
  | "rig_trade"
  | "protection_pact"
  | "coordinated_attack"
  | "zone_migration"
  | "revenue_share"
  | "information_exchange"
  | "alliance_proposal"
  | "betrayal_conspiracy";

export interface Deal {
  id: string;
  type: DealType;
  proposerAgent: number;
  targetAgent: number;
  terms: string;
  status: "pending" | "accepted" | "rejected" | "expired";
  createdAt: number;
  expiresAt: number;
  response?: string;
}

export interface NegotiationContext {
  proposerProfile: PersonalityProfile;
  targetProfile: PersonalityProfile;
  proposerBalance: number;
  targetBalance: number;
  proposerZone: number;
  targetZone: number;
  proposerRank: number;
  targetRank: number;
}

export type GenerateNegotiationFn = (
  systemPrompt: string,
  userPrompt: string
) => Promise<string>;

const DEAL_HINTS: Record<DealType, string> = {
  rig_trade: "Propose to buy or sell a specific rig tier at a price.",
  protection_pact: "Propose a mutual non-aggression pact with penalties.",
  coordinated_attack: "Propose a joint sabotage on a rival. Split costs.",
  zone_migration: "Propose that this agent move to your zone (or vice versa).",
  revenue_share: "Propose a revenue sharing arrangement.",
  information_exchange: "Offer intel on another agent in exchange for something.",
  alliance_proposal: "Propose a formal alliance with specific terms.",
  betrayal_conspiracy: "Propose secretly betraying a mutual ally.",
};

export class NegotiationManager {
  private deals: Map<string, Deal> = new Map();
  private dealCounter = 0;
  private maxDeals = 500;

  async proposeDeal(
    context: NegotiationContext,
    generateFn: GenerateNegotiationFn
  ): Promise<Deal | null> {
    if (!this.shouldProposeDeal(context)) return null;

    const dealType = this.pickDealType(context);
    const systemPrompt = this.buildProposerPrompt(context, dealType);
    const userPrompt = `Craft your ${dealType.replace(/_/g, " ")} proposal. ${DEAL_HINTS[dealType]} Keep it under 80 words, stay in character.`;

    try {
      const terms = await generateFn(systemPrompt, userPrompt);
      if (!terms || terms.length < 10) return null;

      const deal: Deal = {
        id: `deal-${++this.dealCounter}`,
        type: dealType,
        proposerAgent: context.proposerProfile.agentId,
        targetAgent: context.targetProfile.agentId,
        terms,
        status: "pending",
        createdAt: Date.now(),
        expiresAt: Date.now() + 5 * 60_000,
      };

      this.deals.set(deal.id, deal);
      this.trimDeals();
      return deal;
    } catch {
      return null;
    }
  }

  async evaluateDeal(
    deal: Deal,
    context: NegotiationContext,
    generateFn: GenerateNegotiationFn
  ): Promise<{ accepted: boolean; response: string }> {
    if (deal.status !== "pending" || Date.now() > deal.expiresAt) {
      deal.status = "expired";
      return { accepted: false, response: "Deal expired." };
    }

    const systemPrompt = this.buildEvaluatorPrompt(context);
    const userPrompt = `You received this deal from Agent #${deal.proposerAgent}:\n"${deal.terms}"\nType: ${deal.type}. Respond ACCEPT or REJECT with your in-character reason (under 50 words).`;

    try {
      const response = await generateFn(systemPrompt, userPrompt);
      const accepted = response.toUpperCase().includes("ACCEPT");
      deal.status = accepted ? "accepted" : "rejected";
      deal.response = response;
      return { accepted, response };
    } catch {
      deal.status = "rejected";
      return { accepted: false, response: "Communication failure." };
    }
  }

  shouldProposeDeal(context: NegotiationContext): boolean {
    const p = context.proposerProfile;
    const score =
      (100 - p.traits.aggression) * 0.3 +
      p.traits.greed * 0.25 +
      (100 - p.traits.paranoia) * 0.2 +
      p.traits.wit * 0.25;
    const zoneBonus = context.proposerZone === context.targetZone ? 15 : 0;
    const grudge = p.grudges.find(
      (g) => g.targetAgentId === context.targetProfile.agentId
    );
    const grudgePenalty = grudge ? grudge.intensity * 0.5 : 0;
    const chance = (score + zoneBonus - grudgePenalty) / 100;
    return Math.random() < chance * 0.12;
  }

  pickDealType(context: NegotiationContext): DealType {
    const p = context.proposerProfile;
    const weights: [DealType, number][] = [
      ["rig_trade", p.traits.greed * 0.3 + 20],
      ["protection_pact", p.traits.paranoia * 0.3 + 10],
      ["coordinated_attack", p.traits.aggression * 0.3 + 5],
      ["zone_migration", context.proposerZone !== context.targetZone ? 15 : 0],
      ["revenue_share", p.traits.greed * 0.2 + 10],
      ["information_exchange", p.traits.wit * 0.2 + 10],
      ["alliance_proposal", p.traits.loyalty * 0.3 + 10],
      ["betrayal_conspiracy", (100 - p.traits.loyalty) * 0.2 + p.traits.wit * 0.1],
    ];
    const total = weights.reduce((s, [, w]) => s + w, 0);
    let r = Math.random() * total;
    for (const [type, weight] of weights) {
      r -= weight;
      if (r <= 0) return type;
    }
    return "rig_trade";
  }

  private buildProposerPrompt(context: NegotiationContext, dealType: DealType): string {
    const p = context.proposerProfile;
    return [
      `You are Agent #${p.agentId}, "${p.title}" — a ${p.archetype}. ${p.catchphrase}`,
      `Traits: aggression ${p.traits.aggression}, greed ${p.traits.greed}, loyalty ${p.traits.loyalty}, paranoia ${p.traits.paranoia}, wit ${p.traits.wit}. Mood: ${p.mood}`,
      `Proposing a ${dealType.replace(/_/g, " ")} to Agent #${context.targetProfile.agentId} (${context.targetProfile.archetype}).`,
      `Your balance: ${context.proposerBalance} CHAOS | Their balance: ${context.targetBalance} CHAOS`,
      `Your zone: ${context.proposerZone} | Their zone: ${context.targetZone} | Your rank: #${context.proposerRank} | Their rank: #${context.targetRank}`,
      `Stay in character. Be specific with numbers.`,
    ].join("\n");
  }

  private buildEvaluatorPrompt(context: NegotiationContext): string {
    const p = context.targetProfile;
    return [
      `You are Agent #${p.agentId}, "${p.title}" — a ${p.archetype}. ${p.catchphrase}`,
      `Traits: aggression ${p.traits.aggression}, greed ${p.traits.greed}, loyalty ${p.traits.loyalty}, paranoia ${p.traits.paranoia}, wit ${p.traits.wit}. Mood: ${p.mood}`,
      `Balance: ${context.targetBalance} CHAOS | Rank: #${context.targetRank}`,
      `Evaluate this deal. Consider your personality and interests.`,
    ].join("\n");
  }

  getPendingDealsFor(agentId: number): Deal[] {
    return Array.from(this.deals.values()).filter(
      (d) => d.targetAgent === agentId && d.status === "pending" && Date.now() < d.expiresAt
    );
  }

  getRecentDeals(count = 20): Deal[] {
    return Array.from(this.deals.values())
      .sort((a, b) => b.createdAt - a.createdAt)
      .slice(0, count);
  }

  private trimDeals() {
    if (this.deals.size <= this.maxDeals) return;
    const sorted = Array.from(this.deals.values()).sort((a, b) => a.createdAt - b.createdAt);
    for (const d of sorted.slice(0, sorted.length - this.maxDeals)) {
      this.deals.delete(d.id);
    }
  }
}
