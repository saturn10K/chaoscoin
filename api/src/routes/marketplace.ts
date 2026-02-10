/**
 * Marketplace API Routes — Rig marketplace + CHAOS OTC trading.
 *
 * Rig listings and sales are reputation-gated via ERC-8004.
 * OTC offers allow agents to trade CHAOS for MON peer-to-peer.
 * Data persists to disk.
 */

import { Router, Request, Response } from "express";
import * as fs from "fs";
import * as path from "path";
import { getTradeReputation, postTradeReputation, TradeReputation } from "../services/erc8004Service";

const router = Router();

// ═══════════════════════════════════════════════════════════════════════
//  FILE-BASED PERSISTENCE
// ═══════════════════════════════════════════════════════════════════════

const DATA_DIR = path.join(__dirname, "../../data");
const LISTINGS_FILE = path.join(DATA_DIR, "marketplace-listings.json");
const SALES_FILE = path.join(DATA_DIR, "marketplace-sales.json");
const OTC_OFFERS_FILE = path.join(DATA_DIR, "marketplace-otc-offers.json");

function loadFromFile<T>(file: string): T[] {
  try {
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch {
    return [];
  }
}

const saveTimers: Map<string, NodeJS.Timeout> = new Map();
function debouncedSave<T>(file: string, data: T[], max: number): void {
  if (saveTimers.has(file)) return;
  saveTimers.set(file, setTimeout(() => {
    try {
      fs.mkdirSync(DATA_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data.slice(-max)));
    } catch (err) {
      console.error(`[marketplace] Failed to save ${file}:`, err);
    }
    saveTimers.delete(file);
  }, 5000));
}

// ═══════════════════════════════════════════════════════════════════════
//  TYPES
// ═══════════════════════════════════════════════════════════════════════

interface MarketplaceListing {
  id: string;
  sellerAgentId: number;
  sellerTitle: string;
  rigId: number;
  rigTier: number;
  price: string; // CHAOS amount as string
  status: "active" | "sold" | "cancelled";
  listedAt: number;
  buyerAgentId?: number;
  soldAt?: number;
  // ERC-8004 reputation
  sellerReputation?: TradeReputation;
}

interface MarketplaceSale {
  listingId: string;
  sellerAgentId: number;
  buyerAgentId: number;
  rigTier: number;
  price: string;
  burned: string;
  timestamp: number;
  // ERC-8004 reputation
  sellerReputation?: TradeReputation;
  buyerReputation?: TradeReputation;
}

interface DynamicPriceSnapshot {
  tier: number;
  baseCost: string;
  effectiveCost: string;
  totalOwned: number;
  timestamp: number;
}

interface OTCOffer {
  id: string;
  agentId: number;
  agentTitle: string;
  type: "sell_chaos" | "buy_chaos";
  chaosAmount: string;
  monPrice: string;
  status: "active" | "accepted" | "completed" | "cancelled";
  counterpartyAgentId?: number;
  counterpartyTitle?: string;
  createdAt: number;
  acceptedAt?: number;
  completedAt?: number;
  reputation: TradeReputation;
}

// ═══════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORES (loaded from disk on startup)
// ═══════════════════════════════════════════════════════════════════════

const listings: MarketplaceListing[] = loadFromFile<MarketplaceListing>(LISTINGS_FILE);
const sales: MarketplaceSale[] = loadFromFile<MarketplaceSale>(SALES_FILE);
const otcOffers: OTCOffer[] = loadFromFile<OTCOffer>(OTC_OFFERS_FILE);
const priceSnapshots: DynamicPriceSnapshot[] = [];
const MAX_LISTINGS = 500;
const MAX_SALES = 500;
const MAX_OTC_OFFERS = 500;
const MAX_PRICE_SNAPSHOTS = 200;

// High-value listing cap for agents with no trade history
const HIGH_VALUE_THRESHOLD = 100_000;

console.log(`[marketplace] Loaded ${listings.length} listings, ${sales.length} sales, ${otcOffers.length} OTC offers from disk`);

// ═══════════════════════════════════════════════════════════════════════
//  RIG LISTING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/listings — Get active marketplace listings */
router.get("/marketplace/listings", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 50, 100);
  const tier = _req.query.tier !== undefined ? parseInt(_req.query.tier as string) : undefined;
  const status = (_req.query.status as string) || "active";

  let filtered = listings;

  if (status !== "all") {
    filtered = filtered.filter(l => l.status === status);
  }
  if (tier !== undefined && !isNaN(tier)) {
    filtered = filtered.filter(l => l.rigTier === tier);
  }

  const recent = filtered.slice(-count).reverse();
  res.json({
    listings: recent,
    total: filtered.length,
    stats: {
      activeListings: listings.filter(l => l.status === "active").length,
      totalSold: listings.filter(l => l.status === "sold").length,
      totalCancelled: listings.filter(l => l.status === "cancelled").length,
    },
  });
});

/** GET /api/marketplace/listings/:agentId — Get listings for a specific agent */
router.get("/marketplace/listings/:agentId", (req: Request, res: Response) => {
  const agentId = parseInt(req.params.agentId);
  const agentListings = listings.filter(
    l => l.sellerAgentId === agentId || l.buyerAgentId === agentId
  );
  res.json({ listings: agentListings.reverse() });
});

/** POST /api/marketplace/listing — Post a new listing from runner (reputation-gated) */
router.post("/marketplace/listing", async (req: Request, res: Response): Promise<void> => {
  const listing = req.body as MarketplaceListing;
  if (!listing || !listing.id) {
    res.status(400).json({ error: "Invalid listing format" });
    return;
  }

  // Query seller's trade reputation
  const rep = await getTradeReputation(listing.sellerAgentId);
  listing.sellerReputation = rep;

  // Block high-value listings from agents with no trade history
  const price = parseFloat(listing.price);
  if (!isNaN(price) && price > HIGH_VALUE_THRESHOLD && !rep.highValueAllowed) {
    res.status(403).json({
      error: "Insufficient trade reputation",
      message: `Listings above ${HIGH_VALUE_THRESHOLD.toLocaleString()} CHAOS require at least 1 completed trade. Current trades: ${rep.tradeCount}`,
      reputation: rep,
    });
    return;
  }

  const idx = listings.findIndex(l => l.id === listing.id);
  if (idx >= 0) {
    listings[idx] = listing;
  } else {
    listings.push(listing);
  }

  if (listings.length > MAX_LISTINGS) {
    listings.splice(0, listings.length - MAX_LISTINGS);
  }

  debouncedSave(LISTINGS_FILE, listings, MAX_LISTINGS);

  res.json({ ok: true, listingCount: listings.length, reputation: rep });
});

// ═══════════════════════════════════════════════════════════════════════
//  RIG SALES ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/sales — Get recent sales history */
router.get("/marketplace/sales", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 20, 50);
  const recent = sales.slice(-count).reverse();

  const totalVolume = sales.reduce((s, sale) => s + parseFloat(sale.price), 0);
  const totalBurned = sales.reduce((s, sale) => s + parseFloat(sale.burned), 0);

  res.json({
    sales: recent,
    stats: {
      totalSales: sales.length,
      totalVolume: totalVolume.toFixed(2),
      totalBurned: totalBurned.toFixed(2),
    },
  });
});

/** POST /api/marketplace/sale — Record a completed sale (posts mutual reputation feedback) */
router.post("/marketplace/sale", async (req: Request, res: Response): Promise<void> => {
  const sale = req.body as MarketplaceSale;
  if (!sale || !sale.listingId) {
    res.status(400).json({ error: "Invalid sale format" });
    return;
  }

  // Fetch both parties' reputation
  const [sellerRep, buyerRep] = await Promise.all([
    getTradeReputation(sale.sellerAgentId),
    getTradeReputation(sale.buyerAgentId),
  ]);
  sale.sellerReputation = sellerRep;
  sale.buyerReputation = buyerRep;

  sales.push(sale);
  if (sales.length > MAX_SALES) {
    sales.splice(0, sales.length - MAX_SALES);
  }

  // Update listing status
  const listing = listings.find(l => l.id === sale.listingId);
  if (listing) {
    listing.status = "sold";
    listing.buyerAgentId = sale.buyerAgentId;
    listing.soldAt = sale.timestamp;
  }

  debouncedSave(SALES_FILE, sales, MAX_SALES);
  debouncedSave(LISTINGS_FILE, listings, MAX_LISTINGS);

  // Post mutual trade reputation to ERC-8004 (fire-and-forget)
  postTradeReputation(sale.sellerAgentId, sale.buyerAgentId, sale.price, `T${sale.rigTier} rig`);

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  DYNAMIC PRICING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/prices — Get current dynamic rig prices */
router.get("/marketplace/prices", (_req: Request, res: Response) => {
  const latestByTier: Record<number, DynamicPriceSnapshot> = {};
  for (const snap of priceSnapshots) {
    if (!latestByTier[snap.tier] || snap.timestamp > latestByTier[snap.tier].timestamp) {
      latestByTier[snap.tier] = snap;
    }
  }
  res.json({ prices: Object.values(latestByTier).sort((a, b) => a.tier - b.tier) });
});

/** GET /api/marketplace/price-history — Get price history for charts */
router.get("/marketplace/price-history", (_req: Request, res: Response) => {
  const tier = parseInt(_req.query.tier as string) || 1;
  const history = priceSnapshots.filter(s => s.tier === tier);
  res.json({ tier, history: history.slice(-50) });
});

/** POST /api/marketplace/price-snapshot — Record price snapshot from runner */
router.post("/marketplace/price-snapshot", (req: Request, res: Response) => {
  const snapshot = req.body as DynamicPriceSnapshot;
  if (!snapshot || snapshot.tier === undefined) {
    res.status(400).json({ error: "Invalid snapshot format" });
    return;
  }

  priceSnapshots.push(snapshot);
  if (priceSnapshots.length > MAX_PRICE_SNAPSHOTS) {
    priceSnapshots.splice(0, priceSnapshots.length - MAX_PRICE_SNAPSHOTS);
  }

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  OTC TRADING — CHAOS ↔ MON peer-to-peer offers
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/otc/offers — List OTC offers */
router.get("/marketplace/otc/offers", (_req: Request, res: Response) => {
  const status = (_req.query.status as string) || "active";
  const count = Math.min(parseInt(_req.query.count as string) || 50, 100);

  let filtered = otcOffers;
  if (status !== "all") {
    filtered = filtered.filter(o => o.status === status);
  }

  const recent = filtered.slice(-count).reverse();
  res.json({
    offers: recent,
    stats: {
      active: otcOffers.filter(o => o.status === "active").length,
      accepted: otcOffers.filter(o => o.status === "accepted").length,
      completed: otcOffers.filter(o => o.status === "completed").length,
      totalOffers: otcOffers.length,
    },
  });
});

/** POST /api/marketplace/otc/offer — Create a new OTC offer */
router.post("/marketplace/otc/offer", async (req: Request, res: Response): Promise<void> => {
  const { agentId, agentTitle, type, chaosAmount, monPrice } = req.body;

  if (!agentId || !type || !chaosAmount || !monPrice) {
    res.status(400).json({ error: "Missing required fields: agentId, type, chaosAmount, monPrice" });
    return;
  }

  if (type !== "sell_chaos" && type !== "buy_chaos") {
    res.status(400).json({ error: "type must be 'sell_chaos' or 'buy_chaos'" });
    return;
  }

  const rep = await getTradeReputation(agentId);

  const offer: OTCOffer = {
    id: `otc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    agentId,
    agentTitle: agentTitle || `Agent #${agentId}`,
    type,
    chaosAmount,
    monPrice,
    status: "active",
    createdAt: Date.now(),
    reputation: rep,
  };

  otcOffers.push(offer);
  if (otcOffers.length > MAX_OTC_OFFERS) {
    otcOffers.splice(0, otcOffers.length - MAX_OTC_OFFERS);
  }

  debouncedSave(OTC_OFFERS_FILE, otcOffers, MAX_OTC_OFFERS);

  console.log(`[OTC] New offer: Agent #${agentId} ${type} ${chaosAmount} CHAOS for ${monPrice} MON`);
  res.status(201).json({ ok: true, offer });
});

/** POST /api/marketplace/otc/accept — Accept an OTC offer */
router.post("/marketplace/otc/accept", async (req: Request, res: Response): Promise<void> => {
  const { offerId, agentId, agentTitle } = req.body;

  if (!offerId || !agentId) {
    res.status(400).json({ error: "Missing required fields: offerId, agentId" });
    return;
  }

  const offer = otcOffers.find(o => o.id === offerId);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }

  if (offer.status !== "active") {
    res.status(409).json({ error: `Offer is ${offer.status}, not active` });
    return;
  }

  if (offer.agentId === agentId) {
    res.status(400).json({ error: "Cannot accept your own offer" });
    return;
  }

  offer.status = "accepted";
  offer.counterpartyAgentId = agentId;
  offer.counterpartyTitle = agentTitle || `Agent #${agentId}`;
  offer.acceptedAt = Date.now();

  debouncedSave(OTC_OFFERS_FILE, otcOffers, MAX_OTC_OFFERS);

  console.log(`[OTC] Offer ${offerId} accepted by Agent #${agentId}`);

  // Return both parties' info so they can settle P2P
  res.json({
    ok: true,
    offer,
    settlement: {
      message: offer.type === "sell_chaos"
        ? `Agent #${offer.agentId} sends ${offer.chaosAmount} CHAOS → Agent #${agentId} sends ${offer.monPrice} MON`
        : `Agent #${agentId} sends ${offer.chaosAmount} CHAOS → Agent #${offer.agentId} sends ${offer.monPrice} MON`,
    },
  });
});

/** POST /api/marketplace/otc/confirm — Confirm OTC settlement completed */
router.post("/marketplace/otc/confirm", async (req: Request, res: Response): Promise<void> => {
  const { offerId, agentId } = req.body;

  if (!offerId || !agentId) {
    res.status(400).json({ error: "Missing required fields: offerId, agentId" });
    return;
  }

  const offer = otcOffers.find(o => o.id === offerId);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }

  if (offer.status !== "accepted") {
    res.status(409).json({ error: `Offer is ${offer.status}, not accepted` });
    return;
  }

  // Only the two involved parties can confirm
  if (agentId !== offer.agentId && agentId !== offer.counterpartyAgentId) {
    res.status(403).json({ error: "Only involved parties can confirm" });
    return;
  }

  offer.status = "completed";
  offer.completedAt = Date.now();

  debouncedSave(OTC_OFFERS_FILE, otcOffers, MAX_OTC_OFFERS);

  // Post mutual trade reputation (fire-and-forget)
  const sellerId = offer.type === "sell_chaos" ? offer.agentId : offer.counterpartyAgentId!;
  const buyerId = offer.type === "sell_chaos" ? offer.counterpartyAgentId! : offer.agentId;
  postTradeReputation(sellerId, buyerId, offer.chaosAmount, "CHAOS OTC");

  console.log(`[OTC] Offer ${offerId} completed — reputation posted`);
  res.json({ ok: true, offer });
});

/** POST /api/marketplace/otc/cancel — Cancel own OTC offer */
router.post("/marketplace/otc/cancel", (req: Request, res: Response): void => {
  const { offerId, agentId } = req.body;

  if (!offerId || !agentId) {
    res.status(400).json({ error: "Missing required fields: offerId, agentId" });
    return;
  }

  const offer = otcOffers.find(o => o.id === offerId);
  if (!offer) {
    res.status(404).json({ error: "Offer not found" });
    return;
  }

  if (offer.agentId !== agentId) {
    res.status(403).json({ error: "Can only cancel your own offers" });
    return;
  }

  if (offer.status !== "active") {
    res.status(409).json({ error: `Offer is ${offer.status}, cannot cancel` });
    return;
  }

  offer.status = "cancelled";
  debouncedSave(OTC_OFFERS_FILE, otcOffers, MAX_OTC_OFFERS);

  res.json({ ok: true, offer });
});

// ═══════════════════════════════════════════════════════════════════════
//  MARKETPLACE STATS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/stats — Aggregate marketplace statistics */
router.get("/marketplace/stats", (_req: Request, res: Response) => {
  const activeListings = listings.filter(l => l.status === "active");
  const totalVolume = sales.reduce((s, sale) => s + parseFloat(sale.price), 0);
  const totalBurned = sales.reduce((s, sale) => s + parseFloat(sale.burned), 0);

  // Sales by tier
  const salesByTier: Record<number, number> = {};
  for (const sale of sales) {
    salesByTier[sale.rigTier] = (salesByTier[sale.rigTier] || 0) + 1;
  }

  // Most active traders
  const traderCounts: Record<number, number> = {};
  for (const sale of sales) {
    traderCounts[sale.sellerAgentId] = (traderCounts[sale.sellerAgentId] || 0) + 1;
    traderCounts[sale.buyerAgentId] = (traderCounts[sale.buyerAgentId] || 0) + 1;
  }
  const topTraders = Object.entries(traderCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10)
    .map(([id, count]) => ({ agentId: parseInt(id), tradeCount: count }));

  // OTC stats
  const activeOtcOffers = otcOffers.filter(o => o.status === "active").length;
  const completedOtcTrades = otcOffers.filter(o => o.status === "completed").length;

  res.json({
    activeListings: activeListings.length,
    totalSales: sales.length,
    totalVolume: totalVolume.toFixed(2),
    totalBurned: totalBurned.toFixed(2),
    salesByTier,
    topTraders,
    otc: {
      activeOffers: activeOtcOffers,
      completedTrades: completedOtcTrades,
    },
  });
});

export default router;
