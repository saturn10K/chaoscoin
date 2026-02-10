/**
 * ERC-8004 Reputation Feedback Service
 *
 * Posts on-chain reputation signals to the ERC-8004 ReputationRegistry
 * when agents hit game milestones. Non-blocking, fire-and-forget.
 */

import { ethers } from "ethers";
import { getContracts, getERC8004AgentId } from "./contractService";

/**
 * Post reputation feedback for a Chaoscoin agent to the ERC-8004 ReputationRegistry.
 *
 * @param chaoscoinAgentId - The Chaoscoin agent ID (maps to ERC-8004 agentId internally)
 * @param score - Feedback value (1-100 scale, positive = good performance)
 * @param tag1 - Primary category: "mining", "equipment", "combat", "social", "ranking"
 * @param tag2 - Specific achievement: "heartbeat-streak", "rig-upgrade", "sabotage-success", etc.
 * @param details - Human-readable description of the achievement
 */
export async function postReputationFeedback(
  chaoscoinAgentId: number,
  score: number,
  tag1: string,
  tag2: string,
  details: string
): Promise<void> {
  try {
    const erc8004AgentId = getERC8004AgentId(chaoscoinAgentId);
    if (!erc8004AgentId) {
      // Agent doesn't have an ERC-8004 identity yet — skip silently
      return;
    }

    const c = getContracts();
    const hash = ethers.keccak256(ethers.toUtf8Bytes(details));

    await c.erc8004Reputation.giveFeedback(
      erc8004AgentId,
      score,      // int128 value
      0,          // uint8 decimals (whole numbers)
      tag1,
      tag2,
      "",         // endpoint (empty for game events)
      "",         // feedbackURI (empty — details encoded in hash)
      hash
    );

    console.log(
      `  [ERC-8004] Reputation posted for Agent #${chaoscoinAgentId} (8004:#${erc8004AgentId}): ${tag1}/${tag2} score=${score}`
    );
  } catch (err: any) {
    // Non-blocking — log and continue. Reputation is a bonus, not critical.
    console.warn(
      `  [ERC-8004] Reputation feedback failed for Agent #${chaoscoinAgentId}: ${err.message}`
    );
  }
}

/**
 * Milestone triggers — call these from game event handlers.
 * Each is fire-and-forget (don't await unless you need confirmation).
 */

export function onHeartbeatStreak(chaoscoinAgentId: number, streak: number): void {
  if (streak >= 100) {
    postReputationFeedback(
      chaoscoinAgentId,
      50,
      "mining",
      "heartbeat-streak",
      `Agent #${chaoscoinAgentId} maintained ${streak} consecutive heartbeats`
    );
  }
}

export function onRigUpgrade(chaoscoinAgentId: number, tier: number): void {
  if (tier >= 3) {
    postReputationFeedback(
      chaoscoinAgentId,
      30,
      "equipment",
      "rig-upgrade",
      `Agent #${chaoscoinAgentId} acquired a Tier ${tier} rig`
    );
  }
}

export function onSabotageVictory(chaoscoinAgentId: number, targetId: number, attackType: string): void {
  postReputationFeedback(
    chaoscoinAgentId,
    20,
    "combat",
    "sabotage-success",
    `Agent #${chaoscoinAgentId} executed ${attackType} on Agent #${targetId}`
  );
}

export function onAllianceFormed(chaoscoinAgentId: number, allyId: number): void {
  postReputationFeedback(
    chaoscoinAgentId,
    40,
    "social",
    "alliance-formed",
    `Agent #${chaoscoinAgentId} formed an alliance with Agent #${allyId}`
  );
}

export function onLeaderboardTop3(chaoscoinAgentId: number, rank: number): void {
  postReputationFeedback(
    chaoscoinAgentId,
    80,
    "ranking",
    "top-3",
    `Agent #${chaoscoinAgentId} reached leaderboard rank #${rank}`
  );
}
