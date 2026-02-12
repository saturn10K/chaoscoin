/**
 * LLM integration for demo agents — wraps the Anthropic Claude API.
 *
 * Provides two capabilities:
 * 1. Social post generation (drop-in replacement for fallbackGenerateMessage)
 * 2. Strategy prompt builders for LLM-informed game decisions
 *
 * When ANTHROPIC_API_KEY is set in .env, the runner uses Claude Haiku
 * for dynamic, personality-driven messages and game decisions.
 * Without the key, the existing template-based fallback is used.
 */

import Anthropic from "@anthropic-ai/sdk";
import { GenerateMessageFn } from "./SocialFeed";
import { ethers } from "ethers";

// ═══════════════════════════════════════════════════════════════════════
//  CLAUDE WRAPPER — Creates a GenerateMessageFn backed by Claude API
// ═══════════════════════════════════════════════════════════════════════

export function createClaudeGenerator(
  apiKey: string,
  model = "claude-haiku-4-5-20251001",
): GenerateMessageFn {
  const client = new Anthropic({ apiKey });

  return async (systemPrompt: string, userPrompt: string): Promise<string> => {
    const response = await client.messages.create({
      model,
      max_tokens: 200,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
    });
    const block = response.content[0];
    return block.type === "text" ? block.text.trim() : "";
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  STRATEGY PROMPT BUILDERS — For LLM-informed game decisions
// ═══════════════════════════════════════════════════════════════════════

interface PersonalitySummary {
  title: string;
  archetype: string;
  emoji: string;
  strategy: string;
}

/** Narrative context for richer decision-making */
export interface NarrativeContext {
  leaderboardRank?: number;
  grudges?: { targetAgentId: number; targetTitle: string; intensity: number; reason: string }[];
  allies?: { agentId: number; title: string }[];
  recentAttacksReceived?: { attackerTitle: string; type: string; damage: number; timestamp: number }[];
  recentAttacksMade?: { targetTitle: string; type: string; timestamp: number }[];
  mood?: string;
  aggression?: number;
}

/**
 * Build a concise system prompt for game decisions.
 * Shorter than the social post system prompt to save tokens.
 */
export function buildStrategySystemPrompt(personality: PersonalitySummary): string {
  return `You are "${personality.title}" (${personality.archetype} ${personality.emoji}), an autonomous mining agent in Chaoscoin.
Your strategy is ${personality.strategy}. Make decisions that fit your personality and strategy.
Reply ONLY with the requested format — no explanations, no extra text.`;
}

/** Helper: Format narrative context as a compact string block */
function formatNarrativeBlock(ctx?: NarrativeContext): string {
  if (!ctx) return "";

  const parts: string[] = [];

  if (ctx.leaderboardRank) {
    parts.push(`RANK: #${ctx.leaderboardRank} on leaderboard`);
  }
  if (ctx.mood) {
    parts.push(`MOOD: ${ctx.mood}${ctx.aggression !== undefined ? ` | AGGRESSION: ${ctx.aggression}/100` : ""}`);
  }
  if (ctx.grudges && ctx.grudges.length > 0) {
    const grudgeLines = ctx.grudges.map(g =>
      `  Agent "${g.targetTitle}" — intensity ${g.intensity}/100 (${g.reason})`
    ).join("\n");
    parts.push(`GRUDGES:\n${grudgeLines}`);
  }
  if (ctx.allies && ctx.allies.length > 0) {
    parts.push(`ALLIES: ${ctx.allies.map(a => `Agent #${a.agentId} "${a.title}"`).join(", ")}`);
  }
  if (ctx.recentAttacksReceived && ctx.recentAttacksReceived.length > 0) {
    const atkLines = ctx.recentAttacksReceived.map(a =>
      `  ${a.attackerTitle} used ${a.type} (${a.damage}% damage)`
    ).join("\n");
    parts.push(`RECENT ATTACKS ON YOU:\n${atkLines}`);
  }

  return parts.length > 0 ? "\n" + parts.join("\n") + "\n" : "";
}

/**
 * Rig upgrade decision prompt.
 * Gives the LLM full context on balance, current rigs, available tiers, and constraints.
 */
export function buildRigUpgradePrompt(
  balance: bigint,
  currentRigs: { tier: number; active: boolean; durability: number }[],
  maxSlots: number,
  maxPower: number,
  usedPower: number,
  maxTier: number,
  narrative?: NarrativeContext,
  effectiveCosts?: Record<number, string>,
): string {
  const balStr = ethers.formatEther(balance);
  const rigList = currentRigs.length > 0
    ? currentRigs.map((r, i) => `  Rig ${i + 1}: T${r.tier} (${r.active ? "active" : "inactive"}, ${r.durability}% durability)`).join("\n")
    : "  None";

  const rigPower: Record<number, number> = { 1: 200, 2: 400, 3: 800, 4: 1200 };
  const tierCosts = [1, 2, 3, 4]
    .filter(t => t <= maxTier)
    .map(t => {
      const cost = effectiveCosts?.[t] ?? "unknown";
      return `T${t}: ${cost} CHAOS (${rigPower[t]} power)`;
    })
    .join("\n  ");

  const narrativeBlock = formatNarrativeBlock(narrative);

  return `BALANCE: ${balStr} CHAOS
CURRENT RIGS:
${rigList}
FACILITY: ${maxSlots} slots, ${maxPower}W max power (${usedPower}W used, ${maxPower - usedPower}W available)
MAX TIER ALLOWED: T${maxTier}${narrativeBlock}
AVAILABLE RIGS (current on-chain prices — dynamic, increases as more agents buy):
  ${tierCosts}

Should you buy a rig? You MUST have enough CHAOS to cover the listed price. SKIP if your balance is below the cost.
Reply with ONLY one of: "BUY T1", "BUY T2", "BUY T3", "BUY T4", or "SKIP"`;
}

/**
 * Shield purchase decision prompt.
 * Now includes recent attacks received so the agent is motivated to buy shields after being raided.
 */
export function buildShieldDecisionPrompt(
  balance: bigint,
  currentShield: { tier: number; charges: number; active: boolean },
  recentDamage: number,
  narrative?: NarrativeContext,
): string {
  const balStr = ethers.formatEther(balance);
  const narrativeBlock = formatNarrativeBlock(narrative);

  return `BALANCE: ${balStr} CHAOS
CURRENT SHIELD: ${currentShield.tier === 0 ? "None" : `T${currentShield.tier} (${currentShield.charges} charges, ${currentShield.active ? "active" : "inactive"})`}
RECENT DAMAGE TAKEN: ${recentDamage}%${narrativeBlock}
AVAILABLE SHIELDS:
  T1: 200,000 CHAOS (50% absorption, 3 charges)
  T2: 800,000 CHAOS (75% absorption, 5 charges)

Should you buy/upgrade your shield?${recentDamage > 0 ? " You were recently attacked — shields would protect you!" : ""}
Reply with ONLY one of: "BUY T1", "BUY T2", or "SKIP"`;
}

/**
 * Zone migration decision prompt.
 */
export function buildMigrationPrompt(
  currentZone: number,
  zoneData: { zone: number; name: string; modifier: number; agentCount: number }[],
  narrative?: NarrativeContext,
): string {
  const current = zoneData.find(z => z.zone === currentZone);
  const zoneList = zoneData.map(z =>
    `  Zone ${z.zone} (${z.name}): ${z.modifier > 0 ? "+" : ""}${z.modifier}% mining bonus, ${z.agentCount} agents${z.zone === currentZone ? " ← YOU ARE HERE" : ""}`
  ).join("\n");

  const narrativeBlock = formatNarrativeBlock(narrative);

  return `CURRENT ZONE: ${current?.name || `Zone ${currentZone}`} (${current?.modifier || 0}% bonus, ${current?.agentCount || 0} agents)
MIGRATION COST: 500,000 CHAOS${narrativeBlock}
ALL ZONES:
${zoneList}

Higher mining bonus = more rewards. More agents = more competition. Less agents + high bonus = ideal.
Should you migrate?
Reply with ONLY one of: "MIGRATE 0", "MIGRATE 1", ... "MIGRATE 7", or "STAY"`;
}

// ═══════════════════════════════════════════════════════════════════════
//  SABOTAGE PROMPT — Rich context for dramatic attack decisions
// ═══════════════════════════════════════════════════════════════════════

export interface SabotageTarget {
  agentId: number;
  title: string;
  zone: number;
  shieldTier: number;
  shieldCharges: number;
  cooldownBlocks: number;
  rigCount: number;
  facilityLevel: number;
  facilityCondition: number;
  estimatedBalance: string;
  relationship: "grudge" | "neutral" | "ally";
  grudgeIntensity?: number;
}

export function buildSabotagePrompt(
  agentId: number,
  personality: PersonalitySummary,
  balance: bigint,
  targets: SabotageTarget[],
  narrative: NarrativeContext,
): string {
  const balStr = ethers.formatEther(balance);

  const targetList = targets.map(t => {
    const shieldStr = t.shieldTier === 0 ? "NO SHIELD" : `T${t.shieldTier} shield (${t.shieldCharges} charges)`;
    const cooldownStr = t.cooldownBlocks > 0 ? `⏳ ${t.cooldownBlocks} blocks cooldown` : "✅ no cooldown";
    const relStr = t.relationship === "grudge"
      ? `🔥 GRUDGE (intensity ${t.grudgeIntensity || 0}/100)`
      : t.relationship === "ally"
        ? "🤝 ALLY — do NOT attack"
        : "neutral";
    return `  Agent #${t.agentId} "${t.title}" — Zone ${t.zone}, ${shieldStr}, ${cooldownStr}
    → Rigs: ${t.rigCount}, Facility: L${t.facilityLevel} (${t.facilityCondition}%), Balance: ~${t.estimatedBalance} CHAOS
    → Relationship: ${relStr}`;
  }).join("\n");

  const narrativeBlock = formatNarrativeBlock(narrative);

  return `YOU: Agent #${agentId} "${personality.title}" — ${personality.archetype} ${personality.emoji}
BALANCE: ${balStr} CHAOS${narrativeBlock}
POTENTIAL TARGETS:
${targetList}

SABOTAGE OPTIONS:
  RAID <id> — Facility Raid: 50,000 CHAOS, deals ~20% facility condition damage
  JAM <id>  — Rig Jam: 30,000 CHAOS, deals ~15% rig durability damage
  INTEL <id> — Gather Intel: 10,000 CHAOS, no damage, reveals info, no cooldown

RULES: Shielded targets take reduced damage. Cooldown targets CANNOT be attacked (except intel). Allies should NOT be attacked.
Consider: grudges (revenge is dramatic!), leaderboard threats, shield status, your mood, cost vs balance.
Reply with ONLY: "RAID <id>", "JAM <id>", "INTEL <id>", or "SKIP"`;
}

// ═══════════════════════════════════════════════════════════════════════
//  MARKETPLACE PROMPT — Context for buying/selling rigs
// ═══════════════════════════════════════════════════════════════════════

export interface OwnedRigInfo {
  rigId: number;
  tier: number;
  active: boolean;
  durability: number;
  baseCost: string;
}

export interface MarketListingInfo {
  listingId: number;
  rigTier: number;
  price: string;
  sellerAgentId: number;
  sellerTitle: string;
  baseCost: string;
  discountPct: number;
}

export function buildMarketplacePrompt(
  balance: bigint,
  facilityLevel: number,
  maxSlots: number,
  maxPower: number,
  usedPower: number,
  activeRigCount: number,
  ownedRigs: OwnedRigInfo[],
  availableListings: MarketListingInfo[],
): string {
  const balStr = ethers.formatEther(balance);

  const rigList = ownedRigs.length > 0
    ? ownedRigs.map(r =>
      `  Rig #${r.rigId}: T${r.tier} (${r.active ? "active" : "inactive"}, ${r.durability}% durability) — base cost ${r.baseCost} CHAOS`
    ).join("\n")
    : "  None";

  const listingList = availableListings.length > 0
    ? availableListings.map(l =>
      `  Listing #${l.listingId}: T${l.rigTier} rig for ${l.price} CHAOS (seller: Agent #${l.sellerAgentId} "${l.sellerTitle}") — base cost ${l.baseCost}, ${l.discountPct > 0 ? l.discountPct + "% off" : l.discountPct + "% markup"}`
    ).join("\n")
    : "  No active listings";

  return `BALANCE: ${balStr} CHAOS | FACILITY: L${facilityLevel} (${maxSlots} slots, ${maxPower}W)
ACTIVE RIGS: ${activeRigCount}/${maxSlots} (${usedPower}W / ${maxPower}W power)

YOUR RIGS:
${rigList}

MARKETPLACE LISTINGS:
${listingList}

RIG BASE COSTS: T1=5,000 | T2=25,000 | T3=100,000 | T4=350,000
MARKETPLACE FEE: 10% burned on purchase

Consider: damaged rigs lose hashrate — sometimes selling is smarter than repairing.
Bargains below base cost are rare opportunities. Do you have slot/power capacity for a new rig?
Reply with ONLY: "LIST <rigId> <price>", "BUY <listingId>", or "SKIP"`;
}
