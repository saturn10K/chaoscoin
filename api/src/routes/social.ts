/**
 * Social API Routes — Serves the social feed, alliance data, and personality
 * profiles to the dashboard. Data persists to disk via debounced file writes.
 *
 * Agents POST their messages here, and the dashboard GETs them.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
//  FILE-BASED PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

const DATA_DIR = path.join(__dirname, "../../data");
const FEED_FILE = path.join(DATA_DIR, "social-feed.json");
const ALLIANCE_FILE = path.join(DATA_DIR, "alliances.json");
const ALLIANCE_EVENTS_FILE = path.join(DATA_DIR, "alliance-events.json");

function loadFromFile<T>(file: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

const saveTimers: Map<string, NodeJS.Timeout> = new Map();
function debouncedSave<T>(file: string, data: T[], max: number): void {
  if (saveTimers.has(file)) return; // Already scheduled
  saveTimers.set(file, setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data.slice(-max)));
    } catch (err) {
      console.error(`[social] Failed to save ${file}:`, err);
    }
    saveTimers.delete(file);
  }, 5000));
}

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

interface SocialMessage {
  id: string;
  agentId: number;
  agentTitle: string;
  agentEmoji: string;
  archetype: string;
  type: string;
  text: string;
  mood: string;
  zone: number;
  timestamp: number;
  mentionsAgent?: number;
  eventRelated?: boolean;
  replyTo?: string;
}

interface Alliance {
  id: string;
  members: [number, number];
  name: string;
  strength: number;
  formedAtCycle: number;
  zone: number;
  active: boolean;
  endReason?: string;
  betrayedBy?: number;
}

interface AllianceEvent {
  type: string;
  allianceId: string;
  agentIds: number[];
  details: string;
  timestamp: number;
}

interface PersonalityData {
  agentId: number;
  archetype: string;
  emoji: string;
  title: string;
  catchphrase: string;
  traits: Record<string, number>;
  mood: string;
  grudgeCount: number;
  allianceCount: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORES (loaded from disk on startup)
// ═══════════════════════════════════════════════════════════════════════

// Ring buffers — loaded from disk
const messages: SocialMessage[] = loadFromFile<SocialMessage>(FEED_FILE);
const alliances: Alliance[] = loadFromFile<Alliance>(ALLIANCE_FILE);
const allianceEvents: AllianceEvent[] = loadFromFile<AllianceEvent>(ALLIANCE_EVENTS_FILE);
const personalities: Map<number, PersonalityData> = new Map();
const MAX_MESSAGES = 1000;
const MAX_EVENTS = 500;

console.log(`[social] Loaded ${messages.length} messages, ${alliances.length} alliances, ${allianceEvents.length} events from disk`);

// ═══════════════════════════════════════════════════════════════════════
//  SOCIAL FEED ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/social/feed — Get recent messages */
router.get("/social/feed", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 50, 100);
  const zone = _req.query.zone !== undefined ? parseInt(_req.query.zone as string) : undefined;
  const agentId = _req.query.agentId !== undefined ? parseInt(_req.query.agentId as string) : undefined;
  const type = _req.query.type as string | undefined;

  let filtered = messages;

  if (zone !== undefined && !isNaN(zone)) {
    filtered = filtered.filter(m => m.zone === zone);
  }
  if (agentId !== undefined && !isNaN(agentId)) {
    filtered = filtered.filter(m => m.agentId === agentId || m.mentionsAgent === agentId);
  }
  if (type) {
    filtered = filtered.filter(m => m.type === type);
  }

  const recent = filtered.slice(-count).reverse();
  res.json({ messages: recent, total: messages.length });
});

/** GET /api/social/feed/:messageId/thread — Get a message thread */
router.get("/social/feed/:messageId/thread", (req: Request, res: Response) => {
  const messageId = req.params.messageId;
  const root = messages.find(m => m.id === messageId);
  if (!root) {
    res.json({ thread: [] });
    return;
  }
  const replies = messages.filter(m => m.replyTo === messageId);
  res.json({ thread: [root, ...replies] });
});

/** POST /api/social/message — Agent posts a message */
router.post("/social/message", (req: Request, res: Response) => {
  const msg = req.body as SocialMessage;

  if (!msg || !msg.id || !msg.text || msg.agentId === undefined) {
    res.status(400).json({ error: "Invalid message format" });
    return;
  }

  messages.push(msg);
  if (messages.length > MAX_MESSAGES) {
    messages.splice(0, messages.length - MAX_MESSAGES);
  }

  // Persist to disk (debounced)
  debouncedSave(FEED_FILE, messages, MAX_MESSAGES);

  res.json({ ok: true, messageCount: messages.length });
});

// ═══════════════════════════════════════════════════════════════════════
//  ALLIANCE ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/social/alliances — Get all alliances */
router.get("/social/alliances", (_req: Request, res: Response) => {
  const activeOnly = _req.query.active !== "false";
  const filtered = activeOnly ? alliances.filter(a => a.active) : alliances;

  const stats = {
    totalFormed: alliances.length,
    activeCount: alliances.filter(a => a.active).length,
    betrayalCount: alliances.filter(a => a.endReason === "betrayal").length,
    averageStrength: (() => {
      const active = alliances.filter(a => a.active);
      if (active.length === 0) return 0;
      return Math.round(active.reduce((s, a) => s + a.strength, 0) / active.length);
    })(),
  };

  res.json({ alliances: filtered, stats });
});

/** GET /api/social/alliances/:agentId — Get alliances for a specific agent */
router.get("/social/alliances/:agentId", (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const agentAlliances = alliances.filter(
    a => a.active && a.members.includes(agentId)
  );
  const allies = agentAlliances.map(a =>
    a.members[0] === agentId ? a.members[1] : a.members[0]
  );
  res.json({ alliances: agentAlliances, allies });
});

/** GET /api/social/alliance-events — Get recent alliance events */
router.get("/social/alliance-events", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 20, 50);
  const recent = allianceEvents.slice(-count).reverse();
  res.json({ events: recent });
});

/** POST /api/social/alliance — Sync alliance state from runner */
router.post("/social/alliance", (req: Request, res: Response) => {
  const alliance = req.body as Alliance;
  if (!alliance || !alliance.id) {
    res.status(400).json({ error: "Invalid alliance format" });
    return;
  }

  const idx = alliances.findIndex(a => a.id === alliance.id);
  if (idx >= 0) {
    alliances[idx] = alliance;
  } else {
    alliances.push(alliance);
  }

  // Persist to disk (debounced)
  debouncedSave(ALLIANCE_FILE, alliances, 500);

  res.json({ ok: true, allianceCount: alliances.length });
});

/** POST /api/social/alliance-event — Post alliance event */
router.post("/social/alliance-event", (req: Request, res: Response) => {
  const event = req.body as AllianceEvent;
  if (!event || !event.type) {
    res.status(400).json({ error: "Invalid event format" });
    return;
  }

  allianceEvents.push(event);
  if (allianceEvents.length > MAX_EVENTS) {
    allianceEvents.splice(0, allianceEvents.length - MAX_EVENTS);
  }

  // Persist to disk (debounced)
  debouncedSave(ALLIANCE_EVENTS_FILE, allianceEvents, MAX_EVENTS);

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  PERSONALITY ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/social/personalities — Get all agent personalities */
router.get("/social/personalities", (_req: Request, res: Response) => {
  const all = [...personalities.values()];
  res.json({ personalities: all });
});

/** GET /api/social/personality/:agentId — Get personality for one agent */
router.get("/social/personality/:agentId", (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const p = personalities.get(agentId);
  if (!p) {
    res.status(404).json({ error: "Personality not found" });
    return;
  }
  res.json(p);
});

/** POST /api/social/personality — Sync personality from runner */
router.post("/social/personality", (req: Request, res: Response) => {
  const p = req.body as PersonalityData;
  if (!p || p.agentId === undefined) {
    res.status(400).json({ error: "Invalid personality format" });
    return;
  }
  personalities.set(p.agentId, p);
  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  SOCIAL STATS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/social/stats — Aggregate social statistics */
router.get("/social/stats", (_req: Request, res: Response) => {
  // Message type breakdown
  const typeCounts: Record<string, number> = {};
  for (const m of messages) {
    typeCounts[m.type] = (typeCounts[m.type] || 0) + 1;
  }

  // Most active agents
  const agentCounts: Record<number, number> = {};
  for (const m of messages) {
    agentCounts[m.agentId] = (agentCounts[m.agentId] || 0) + 1;
  }
  const topPosters = Object.entries(agentCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({ agentId: parseInt(id), messageCount: count }));

  // Archetype distribution
  const archetypeCounts: Record<string, number> = {};
  for (const p of personalities.values()) {
    archetypeCounts[p.archetype] = (archetypeCounts[p.archetype] || 0) + 1;
  }

  res.json({
    totalMessages: messages.length,
    totalAlliances: alliances.length,
    activeAlliances: alliances.filter(a => a.active).length,
    totalBetrayals: alliances.filter(a => a.endReason === "betrayal").length,
    totalPersonalities: personalities.size,
    messageTypes: typeCounts,
    topPosters,
    archetypeDistribution: archetypeCounts,
  });
});

export default router;
