/**
 * Sabotage API Routes — Serves sabotage attack logs, intel reports,
 * and destruction stats to the dashboard.
 *
 * Agents POST attack results here, and the dashboard GETs them.
 */

import { Router, Request, Response } from "express";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

interface SabotageEvent {
  id: string;
  type: "facility_raid" | "rig_jam" | "intel_gathering";
  attackerAgentId: number;
  attackerTitle: string;
  targetAgentId: number;
  targetTitle: string;
  cost: string;         // CHAOS spent
  burned: string;       // CHAOS burned (80%)
  damage: number;       // % damage dealt (after shield reduction)
  shieldReduction: number; // % reduction from shield
  zone: number;
  timestamp: number;
  narrative?: string;   // LLM-generated flavor text
}

interface NegotiationEvent {
  id: string;
  type: string; // deal type: rig_trade, protection_pact, etc.
  proposerAgentId: number;
  proposerTitle: string;
  targetAgentId: number;
  targetTitle: string;
  terms: string;
  outcome: "accepted" | "rejected" | "expired";
  response?: string;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORES
// ═══════════════════════════════════════════════════════════════════════

const sabotageEvents: SabotageEvent[] = [];
const negotiationEvents: NegotiationEvent[] = [];
const MAX_SABOTAGE = 500;
const MAX_NEGOTIATIONS = 300;

// ═══════════════════════════════════════════════════════════════════════
//  SABOTAGE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/sabotage/events — Get recent sabotage events */
router.get("/sabotage/events", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 30, 100);
  const type = _req.query.type as string | undefined;
  const agentId = _req.query.agentId !== undefined ? parseInt(_req.query.agentId as string) : undefined;

  let filtered = sabotageEvents;

  if (type) {
    filtered = filtered.filter(e => e.type === type);
  }
  if (agentId !== undefined && !isNaN(agentId)) {
    filtered = filtered.filter(
      e => e.attackerAgentId === agentId || e.targetAgentId === agentId
    );
  }

  const recent = filtered.slice(-count).reverse();
  res.json({ events: recent, total: sabotageEvents.length });
});

/** GET /api/sabotage/events/:agentId — Get sabotage events involving an agent */
router.get("/sabotage/events/:agentId", (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const attacks = sabotageEvents.filter(e => e.attackerAgentId === agentId);
  const defenses = sabotageEvents.filter(e => e.targetAgentId === agentId);
  res.json({ attacks, defenses });
});

/** POST /api/sabotage/event — Record a sabotage event from runner */
router.post("/sabotage/event", (req: Request, res: Response) => {
  const event = req.body as SabotageEvent;
  if (!event || !event.id || !event.type) {
    res.status(400).json({ error: "Invalid sabotage event format" });
    return;
  }

  sabotageEvents.push(event);
  if (sabotageEvents.length > MAX_SABOTAGE) {
    sabotageEvents.splice(0, sabotageEvents.length - MAX_SABOTAGE);
  }

  res.json({ ok: true, totalEvents: sabotageEvents.length });
});

// ═══════════════════════════════════════════════════════════════════════
//  NEGOTIATION ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/sabotage/negotiations — Get recent negotiations */
router.get("/sabotage/negotiations", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 20, 50);
  const outcome = _req.query.outcome as string | undefined;

  let filtered = negotiationEvents;
  if (outcome) {
    filtered = filtered.filter(n => n.outcome === outcome);
  }

  const recent = filtered.slice(-count).reverse();
  res.json({ negotiations: recent, total: negotiationEvents.length });
});

/** POST /api/sabotage/negotiation — Record a negotiation result from runner */
router.post("/sabotage/negotiation", (req: Request, res: Response) => {
  const negotiation = req.body as NegotiationEvent;
  if (!negotiation || !negotiation.id) {
    res.status(400).json({ error: "Invalid negotiation format" });
    return;
  }

  negotiationEvents.push(negotiation);
  if (negotiationEvents.length > MAX_NEGOTIATIONS) {
    negotiationEvents.splice(0, negotiationEvents.length - MAX_NEGOTIATIONS);
  }

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  SABOTAGE STATS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/sabotage/stats — Aggregate sabotage statistics */
router.get("/sabotage/stats", (_req: Request, res: Response) => {
  const totalBurned = sabotageEvents.reduce((s, e) => s + parseFloat(e.burned), 0);
  const totalCost = sabotageEvents.reduce((s, e) => s + parseFloat(e.cost), 0);

  // Attacks by type
  const byType: Record<string, number> = {};
  for (const e of sabotageEvents) {
    byType[e.type] = (byType[e.type] || 0) + 1;
  }

  // Most aggressive agents
  const attackerCounts: Record<number, number> = {};
  for (const e of sabotageEvents) {
    attackerCounts[e.attackerAgentId] = (attackerCounts[e.attackerAgentId] || 0) + 1;
  }
  const topAttackers = Object.entries(attackerCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({ agentId: parseInt(id), attackCount: count }));

  // Most targeted agents
  const targetCounts: Record<number, number> = {};
  for (const e of sabotageEvents) {
    targetCounts[e.targetAgentId] = (targetCounts[e.targetAgentId] || 0) + 1;
  }
  const topTargets = Object.entries(targetCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({ agentId: parseInt(id), timesTargeted: count }));

  // Negotiation stats
  const negotiationStats = {
    total: negotiationEvents.length,
    accepted: negotiationEvents.filter(n => n.outcome === "accepted").length,
    rejected: negotiationEvents.filter(n => n.outcome === "rejected").length,
    acceptRate: negotiationEvents.length > 0
      ? Math.round(
          (negotiationEvents.filter(n => n.outcome === "accepted").length / negotiationEvents.length) * 100
        )
      : 0,
  };

  res.json({
    totalAttacks: sabotageEvents.length,
    totalCost: totalCost.toFixed(2),
    totalBurned: totalBurned.toFixed(2),
    attacksByType: byType,
    topAttackers,
    topTargets,
    negotiations: negotiationStats,
  });
});

export default router;
