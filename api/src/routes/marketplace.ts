/**
 * Marketplace API Routes — Serves rig marketplace listings, sales history,
 * and dynamic pricing data to the dashboard.
 *
 * Agents POST listings/sales here, and the dashboard GETs them.
 */

import { Router, Request, Response } from "express";

const router = Router();

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
}

interface MarketplaceSale {
  listingId: string;
  sellerAgentId: number;
  buyerAgentId: number;
  rigTier: number;
  price: string;
  burned: string;
  timestamp: number;
}

interface DynamicPriceSnapshot {
  tier: number;
  baseCost: string;
  effectiveCost: string;
  totalOwned: number;
  timestamp: number;
}

// ═══════════════════════════════════════════════════════════════════════
//  IN-MEMORY STORES
// ═══════════════════════════════════════════════════════════════════════

const listings: MarketplaceListing[] = [];
const sales: MarketplaceSale[] = [];
const priceSnapshots: DynamicPriceSnapshot[] = [];
const MAX_LISTINGS = 500;
const MAX_SALES = 500;
const MAX_PRICE_SNAPSHOTS = 200;

// ═══════════════════════════════════════════════════════════════════════
//  LISTING ENDPOINTS
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

/** POST /api/marketplace/listing — Post a new listing from runner */
router.post("/marketplace/listing", (req: Request, res: Response) => {
  const listing = req.body as MarketplaceListing;
  if (!listing || !listing.id) {
    res.status(400).json({ error: "Invalid listing format" });
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

  res.json({ ok: true, listingCount: listings.length });
});

// ═══════════════════════════════════════════════════════════════════════
//  SALES ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/sales — Get recent sales history */
router.get("/marketplace/sales", (_req: Request, res: Response) => {
  const count = Math.min(parseInt(_req.query.count as string) || 20, 50);
  const recent = sales.slice(-count).reverse();

  // Compute volume stats
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

/** POST /api/marketplace/sale — Record a completed sale from runner */
router.post("/marketplace/sale", (req: Request, res: Response) => {
  const sale = req.body as MarketplaceSale;
  if (!sale || !sale.listingId) {
    res.status(400).json({ error: "Invalid sale format" });
    return;
  }

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

  res.json({ ok: true });
});

// ═══════════════════════════════════════════════════════════════════════
//  DYNAMIC PRICING ENDPOINTS
// ═══════════════════════════════════════════════════════════════════════

/** GET /api/marketplace/prices — Get current dynamic rig prices */
router.get("/marketplace/prices", (_req: Request, res: Response) => {
  // Return latest snapshot for each tier
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

  res.json({
    activeListings: activeListings.length,
    totalSales: sales.length,
    totalVolume: totalVolume.toFixed(2),
    totalBurned: totalBurned.toFixed(2),
    salesByTier,
    topTraders,
  });
});

export default router;
