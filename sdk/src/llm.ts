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
  model = "claude-3-5-haiku-20241022",
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

/**
 * Build a concise system prompt for game decisions.
 * Shorter than the social post system prompt to save tokens.
 */
export function buildStrategySystemPrompt(personality: PersonalitySummary): string {
  return `You are "${personality.title}" (${personality.archetype} ${personality.emoji}), an autonomous mining agent in Chaoscoin.
Your strategy is ${personality.strategy}. Make decisions that fit your personality and strategy.
Reply ONLY with the requested format — no explanations, no extra text.`;
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
): string {
  const balStr = ethers.formatEther(balance);
  const rigList = currentRigs.length > 0
    ? currentRigs.map((r, i) => `  Rig ${i + 1}: T${r.tier} (${r.active ? "active" : "inactive"}, ${r.durability}% durability)`).join("\n")
    : "  None";

  const tierCosts = [
    "T1: 5,000 CHAOS (200 power)",
    "T2: 25,000 CHAOS (400 power)",
    "T3: 100,000 CHAOS (800 power)",
    "T4: 350,000 CHAOS (1,200 power)",
  ].filter((_, i) => i + 1 <= maxTier).join("\n  ");

  return `BALANCE: ${balStr} CHAOS
CURRENT RIGS:
${rigList}
FACILITY: ${maxSlots} slots, ${maxPower}W max power (${usedPower}W used, ${maxPower - usedPower}W available)
MAX TIER ALLOWED: T${maxTier}

AVAILABLE RIGS:
  ${tierCosts}

Should you buy a rig? Consider your balance, available power/slots, and strategy.
Reply with ONLY one of: "BUY T1", "BUY T2", "BUY T3", "BUY T4", or "SKIP"`;
}

/**
 * Shield purchase decision prompt.
 */
export function buildShieldDecisionPrompt(
  balance: bigint,
  currentShield: { tier: number; charges: number; active: boolean },
  recentDamage: number,
): string {
  const balStr = ethers.formatEther(balance);
  return `BALANCE: ${balStr} CHAOS
CURRENT SHIELD: ${currentShield.tier === 0 ? "None" : `T${currentShield.tier} (${currentShield.charges} charges, ${currentShield.active ? "active" : "inactive"})`}
RECENT DAMAGE TAKEN: ${recentDamage}%

AVAILABLE SHIELDS:
  T1: 200,000 CHAOS (50% absorption, 3 charges)
  T2: 800,000 CHAOS (75% absorption, 5 charges)

Should you buy/upgrade your shield?
Reply with ONLY one of: "BUY T1", "BUY T2", or "SKIP"`;
}

/**
 * Zone migration decision prompt.
 */
export function buildMigrationPrompt(
  currentZone: number,
  zoneData: { zone: number; name: string; modifier: number; agentCount: number }[],
): string {
  const current = zoneData.find(z => z.zone === currentZone);
  const zoneList = zoneData.map(z =>
    `  Zone ${z.zone} (${z.name}): ${z.modifier > 0 ? "+" : ""}${z.modifier}% mining bonus, ${z.agentCount} agents${z.zone === currentZone ? " ← YOU ARE HERE" : ""}`
  ).join("\n");

  return `CURRENT ZONE: ${current?.name || `Zone ${currentZone}`} (${current?.modifier || 0}% bonus, ${current?.agentCount || 0} agents)
MIGRATION COST: 500,000 CHAOS

ALL ZONES:
${zoneList}

Higher mining bonus = more rewards. More agents = more competition. Less agents + high bonus = ideal.
Should you migrate?
Reply with ONLY one of: "MIGRATE 0", "MIGRATE 1", ... "MIGRATE 7", or "STAY"`;
}
