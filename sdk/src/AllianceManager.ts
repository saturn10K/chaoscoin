/**
 * Alliance Manager — Handles formation, maintenance, and betrayal of
 * inter-agent alliances. Alliances are off-chain social constructs
 * that influence agent behavior and generate drama.
 *
 * Alliance mechanics:
 * - Agents propose alliances based on personality (loyalty, zone proximity)
 * - Alliances have strength that decays over time without reinforcement
 * - Betrayals happen when an agent's greed/chaos outweighs their loyalty
 * - Zone-based factions form naturally from geography + alliances
 * - Grudges spawn from betrayals, creating long-running rivalries
 *
 * All state is in-memory and coordinated through the API server.
 * Each agent makes independent decisions — there's no "alliance contract".
 */

import { PersonalityProfile, addGrudge, Grudge } from "./Personality";

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

export interface Alliance {
  id: string;
  /** The two agents in the alliance */
  members: [number, number];
  /** Alliance name (auto-generated) */
  name: string;
  /** Strength 0-100. Decays over time, reinforced by actions. */
  strength: number;
  /** When the alliance was formed (cycle count) */
  formedAtCycle: number;
  /** Zone where the alliance was formed */
  zone: number;
  /** Is this alliance still active? */
  active: boolean;
  /** How the alliance ended, if it did */
  endReason?: "betrayal" | "decay" | "mutual_dissolution";
  /** Who betrayed (if betrayal) */
  betrayedBy?: number;
}

export interface AllianceProposal {
  fromAgentId: number;
  toAgentId: number;
  fromTitle: string;
  fromArchetype: string;
  reason: string;
  timestamp: number;
}

export interface AllianceEvent {
  type: "formed" | "strengthened" | "weakened" | "betrayed" | "dissolved";
  allianceId: string;
  agentIds: number[];
  details: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  ALLIANCE NAME GENERATOR
// ═══════════════════════════════════════════════════════════════════════

const ALLIANCE_PREFIXES = [
  "Iron", "Shadow", "Cosmic", "Burning", "Frozen", "Silent", "Golden",
  "Quantum", "Stellar", "Dark", "Blazing", "Crystal", "Thunder", "Void",
  "Nebula", "Radiant", "Obsidian", "Phantom", "Crimson", "Azure",
];

const ALLIANCE_SUFFIXES = [
  "Pact", "Coalition", "Syndicate", "Alliance", "Compact", "Union",
  "Accord", "Brotherhood", "Order", "Circle", "Legion", "Covenant",
  "Cartel", "Network", "Front", "Collective", "Guild", "Bond",
];

function generateAllianceName(agent1Id: number, agent2Id: number): string {
  const seed = agent1Id * 31 + agent2Id * 37;
  const prefix = ALLIANCE_PREFIXES[seed % ALLIANCE_PREFIXES.length];
  const suffix = ALLIANCE_SUFFIXES[(seed * 7) % ALLIANCE_SUFFIXES.length];
  return `The ${prefix} ${suffix}`;
}

// ═══════════════════════════════════════════════════════════════════════
//  ALLIANCE DECISION LOGIC
// ═══════════════════════════════════════════════════════════════════════

/**
 * Evaluate whether an agent wants to propose an alliance with a target.
 * Returns a reason string if yes, null if no.
 */
export function evaluateAllianceDesire(
  profile: PersonalityProfile,
  targetProfile: PersonalityProfile,
  sameZone: boolean,
  myRank: number,
  targetRank: number,
  existingAllianceCount: number,
): string | null {
  const t = profile.traits;

  // Low loyalty agents rarely propose alliances
  if (t.loyalty < 25 && Math.random() > 0.1) return null;

  // Already in too many alliances (max 3)
  if (existingAllianceCount >= 3) return null;

  // Base desire from loyalty
  let desire = t.loyalty / 100;

  // Same zone bonus — much more likely to ally with zone-mates
  if (sameZone) desire += 0.3;

  // Rank proximity — allies who are close in rank feel like peers
  const rankDiff = Math.abs(myRank - targetRank);
  if (rankDiff < 10) desire += 0.15;

  // Compatible personalities bonus
  const targetT = targetProfile.traits;
  if (Math.abs(t.aggression - targetT.aggression) < 30) desire += 0.1;
  if (t.loyalty > 50 && targetT.loyalty > 50) desire += 0.2;

  // Paranoid agents are suspicious of very aggressive targets
  if (t.paranoia > 60 && targetT.aggression > 70) desire -= 0.3;

  // Greedy agents want to ally with strong miners
  if (t.greed > 60 && targetRank < myRank) desire += 0.15;

  // Existing grudges prevent alliances
  const hasGrudge = profile.grudges.some(g => g.targetAgentId === targetProfile.agentId);
  if (hasGrudge) return null;

  // Roll
  if (Math.random() > desire) return null;

  // Generate reason
  const reasons = [];
  if (sameZone) reasons.push("zone solidarity");
  if (rankDiff < 5) reasons.push("we're evenly matched");
  if (t.loyalty > 70) reasons.push("strength through unity");
  if (t.paranoia > 60) reasons.push("safety in numbers");
  if (t.greed > 60 && targetRank < myRank) reasons.push("mutual profit");

  return reasons.length > 0 ? reasons.join(", ") : "strategic alignment";
}

/**
 * Evaluate whether an agent accepts an incoming alliance proposal.
 */
export function evaluateAllianceAcceptance(
  profile: PersonalityProfile,
  proposerProfile: PersonalityProfile,
  sameZone: boolean,
): boolean {
  const t = profile.traits;

  // Very low loyalty = almost never accept
  if (t.loyalty < 15) return false;

  let acceptance = t.loyalty / 100;

  if (sameZone) acceptance += 0.25;
  if (t.paranoia > 70) acceptance -= 0.2;
  if (t.chaos > 70) acceptance += 0.1; // Chaos agents are impulsive

  // Check for grudge against proposer
  const hasGrudge = profile.grudges.some(g => g.targetAgentId === proposerProfile.agentId);
  if (hasGrudge) acceptance -= 0.5;

  return Math.random() < acceptance;
}

/**
 * Evaluate whether an agent betrays their alliance this cycle.
 * Returns betrayal reason or null.
 */
export function evaluateBetrayalDesire(
  profile: PersonalityProfile,
  alliance: Alliance,
  myRank: number,
  partnerRank: number,
  allianceAge: number, // cycles since formation
): string | null {
  const t = profile.traits;

  // High loyalty agents rarely betray
  if (t.loyalty > 75 && Math.random() > 0.05) return null;

  let betrayalChance = 0;

  // Low loyalty base chance
  betrayalChance += (100 - t.loyalty) / 500; // 0-0.2

  // Greed: if partner is much higher ranked, temptation to "go solo"
  if (partnerRank < myRank - 5) {
    betrayalChance += (t.greed / 100) * 0.1;
  }

  // Chaos: random betrayals for chaotic agents
  betrayalChance += (t.chaos / 100) * 0.05;

  // Alliance age: old alliances have more trust... unless you're vengeful
  if (allianceAge > 20) {
    betrayalChance -= 0.05; // Trust builds
    if (t.vengefulness > 70) betrayalChance += 0.03; // Unless you're bitter
  }

  // Weak alliances are easier to betray
  if (alliance.strength < 30) betrayalChance += 0.1;

  if (Math.random() > betrayalChance) return null;

  // Generate reason
  const reasons = [];
  if (t.greed > 60) reasons.push("I need to look out for myself");
  if (t.chaos > 60) reasons.push("chaos demands it");
  if (alliance.strength < 30) reasons.push("this alliance was already dead");
  if (t.loyalty < 30) reasons.push("loyalty is a weakness");
  if (partnerRank < myRank - 10) reasons.push("they were holding me back");

  return reasons.length > 0 ? reasons[Math.floor(Math.random() * reasons.length)] : "strategic realignment";
}

// ═══════════════════════════════════════════════════════════════════════
//  ALLIANCE MANAGER — Shared singleton managing all alliances
// ═══════════════════════════════════════════════════════════════════════

export class AllianceManager {
  private alliances: Map<string, Alliance> = new Map();
  private proposals: AllianceProposal[] = [];
  private events: AllianceEvent[] = [];
  private maxEvents = 500;
  private allianceCounter = 0;

  // ── Queries ──

  /** Get all active alliances */
  getActiveAlliances(): Alliance[] {
    return [...this.alliances.values()].filter(a => a.active);
  }

  /** Get alliances for a specific agent */
  getAgentAlliances(agentId: number): Alliance[] {
    return [...this.alliances.values()].filter(
      a => a.active && a.members.includes(agentId)
    );
  }

  /** Get alliance partner IDs for an agent */
  getAllyIds(agentId: number): number[] {
    return this.getAgentAlliances(agentId).map(a =>
      a.members[0] === agentId ? a.members[1] : a.members[0]
    );
  }

  /** Check if two agents are allied */
  areAllied(agent1: number, agent2: number): boolean {
    return [...this.alliances.values()].some(
      a => a.active && a.members.includes(agent1) && a.members.includes(agent2)
    );
  }

  /** Get pending proposals for an agent */
  getPendingProposals(agentId: number): AllianceProposal[] {
    return this.proposals.filter(p => p.toAgentId === agentId);
  }

  /** Get recent alliance events */
  getRecentEvents(count = 20): AllianceEvent[] {
    return this.events.slice(-count).reverse();
  }

  /** Get all alliances (active and inactive) */
  getAllAlliances(): Alliance[] {
    return [...this.alliances.values()];
  }

  // ── Actions ──

  /** Propose an alliance */
  propose(proposal: AllianceProposal): void {
    // Don't allow duplicate proposals
    const exists = this.proposals.some(
      p => p.fromAgentId === proposal.fromAgentId && p.toAgentId === proposal.toAgentId
    );
    if (exists) return;

    // Don't allow proposals to existing allies
    if (this.areAllied(proposal.fromAgentId, proposal.toAgentId)) return;

    this.proposals.push(proposal);
  }

  /** Accept a proposal and form an alliance */
  acceptProposal(fromAgentId: number, toAgentId: number, zone: number, currentCycle: number): Alliance | null {
    const idx = this.proposals.findIndex(
      p => p.fromAgentId === fromAgentId && p.toAgentId === toAgentId
    );
    if (idx === -1) return null;

    this.proposals.splice(idx, 1);

    const id = `alliance-${this.allianceCounter++}`;
    const alliance: Alliance = {
      id,
      members: [fromAgentId, toAgentId],
      name: generateAllianceName(fromAgentId, toAgentId),
      strength: 60 + Math.floor(Math.random() * 20), // Start at 60-80
      formedAtCycle: currentCycle,
      zone,
      active: true,
    };

    this.alliances.set(id, alliance);
    this.addEvent({
      type: "formed",
      allianceId: id,
      agentIds: [fromAgentId, toAgentId],
      details: `${alliance.name} formed between Agent #${fromAgentId} and Agent #${toAgentId}`,
      timestamp: Date.now(),
    });

    return alliance;
  }

  /** Reject a proposal */
  rejectProposal(fromAgentId: number, toAgentId: number): void {
    this.proposals = this.proposals.filter(
      p => !(p.fromAgentId === fromAgentId && p.toAgentId === toAgentId)
    );
  }

  /** Strengthen an alliance (through cooperation) */
  strengthenAlliance(allianceId: string, amount: number): void {
    const alliance = this.alliances.get(allianceId);
    if (!alliance || !alliance.active) return;

    alliance.strength = Math.min(100, alliance.strength + amount);
    this.addEvent({
      type: "strengthened",
      allianceId,
      agentIds: [...alliance.members],
      details: `${alliance.name} strengthened to ${alliance.strength}%`,
      timestamp: Date.now(),
    });
  }

  /** Betray an alliance — returns the grudge created for the victim */
  betrayAlliance(allianceId: string, betrayerId: number, reason: string): Grudge | null {
    const alliance = this.alliances.get(allianceId);
    if (!alliance || !alliance.active) return null;

    const victimId = alliance.members[0] === betrayerId
      ? alliance.members[1]
      : alliance.members[0];

    alliance.active = false;
    alliance.endReason = "betrayal";
    alliance.betrayedBy = betrayerId;

    this.addEvent({
      type: "betrayed",
      allianceId,
      agentIds: [betrayerId, victimId],
      details: `Agent #${betrayerId} betrayed ${alliance.name}! Reason: "${reason}"`,
      timestamp: Date.now(),
    });

    // Create a grudge for the victim
    // (The caller should add this to the victim's profile)
    return {
      targetAgentId: betrayerId,
      reason: `Betrayed our alliance "${alliance.name}": ${reason}`,
      intensity: 80,
      createdAtCycle: 0, // Caller should set this
    };
  }

  /** Decay all alliances by a small amount each cycle */
  tickAlliances(currentCycle: number): void {
    for (const alliance of this.alliances.values()) {
      if (!alliance.active) continue;

      // Strength decays ~1 per cycle
      alliance.strength -= 1;

      if (alliance.strength <= 0) {
        alliance.active = false;
        alliance.endReason = "decay";
        this.addEvent({
          type: "dissolved",
          allianceId: alliance.id,
          agentIds: [...alliance.members],
          details: `${alliance.name} dissolved from neglect`,
          timestamp: Date.now(),
        });
      } else if (alliance.strength < 20) {
        this.addEvent({
          type: "weakened",
          allianceId: alliance.id,
          agentIds: [...alliance.members],
          details: `${alliance.name} is weakening (${alliance.strength}%)`,
          timestamp: Date.now(),
        });
      }
    }

    // Clean up old proposals (expire after 10 cycles worth of time)
    const cutoff = Date.now() - 10 * 90_000; // ~10 cycles at 90s
    this.proposals = this.proposals.filter(p => p.timestamp > cutoff);
  }

  // ── Internal ──

  private addEvent(event: AllianceEvent): void {
    this.events.push(event);
    if (this.events.length > this.maxEvents) {
      this.events = this.events.slice(-this.maxEvents);
    }
  }

  // ── Stats for dashboard ──

  getStats(): {
    totalFormed: number;
    activeCount: number;
    betrayalCount: number;
    averageStrength: number;
  } {
    const all = [...this.alliances.values()];
    const active = all.filter(a => a.active);
    const betrayals = all.filter(a => a.endReason === "betrayal");
    const avgStrength = active.length > 0
      ? active.reduce((sum, a) => sum + a.strength, 0) / active.length
      : 0;

    return {
      totalFormed: all.length,
      activeCount: active.length,
      betrayalCount: betrayals.length,
      averageStrength: Math.round(avgStrength),
    };
  }
}
