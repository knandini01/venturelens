import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { geocode, haversineDistance } from "../services/GeoService.js";
import { findNearbyShops } from "../services/OverpassService.js";
import { datasetService, type Buyer } from "../services/DatasetService.js";
import { compareAndRecommend, type DecisionOption } from "./decisionSupport.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ratesConfig = JSON.parse(
  readFileSync(join(__dirname, "../../config/rates.json"), "utf-8")
) as { categoryToShopTags: Record<string, string[]> };

// ── Helpers ───────────────────────────────────────────────────────────────────

function inferCategory(product: string): string {
  if (/soap|detergent|shampoo|oil|biscuit|snack|food|fmcg/i.test(product)) return "fmcg";
  if (/grain|wheat|rice|chilli|turmeric|agri|spice|vegetable|fruit|sugar|honey/i.test(product)) return "agri";
  if (/cloth|fabric|silk|cotton|textile/i.test(product)) return "textiles";
  if (/tablet|medicine|pharma/i.test(product)) return "pharma";
  if (/craft|art|handicraft|handmade/i.test(product)) return "handicrafts";
  return "general";
}

function categoryToTags(category: string): string[] {
  const lower = category.toLowerCase();
  for (const [key, tags] of Object.entries(ratesConfig.categoryToShopTags)) {
    if (lower.includes(key)) return tags;
  }
  return ratesConfig.categoryToShopTags["general"];
}

interface BuyerResult {
  id: string;
  name: string;
  businessType: "retailer" | "wholesaler" | "distributor";
  location: string;
  distanceKm: number;
  estimatedOrderVolume: number;
  estimatedProfit: number;
  rank: number;
  source: "osm" | "dataset";
  contact?: string;
  rating?: number;
}

// ── Dataset buyers → BuyerResult ─────────────────────────────────────────────

async function datasetBuyersNear(
  type: "retailer" | "wholesaler" | "distributor",
  product: string,
  locationGeo: { lat: number; lon: number },
  radiusKm: number
): Promise<BuyerResult[]> {
  const category = inferCategory(product);
  const all = datasetService.getBuyers();
  return all
    .filter(b => {
      if (b.businessType !== type) return false;
      const dist = haversineDistance(locationGeo.lat, locationGeo.lon, b.lat, b.lon);
      return dist <= radiusKm;
    })
    .map(b => {
      const dist = haversineDistance(locationGeo.lat, locationGeo.lon, b.lat, b.lon);
      return {
        id: b.id,
        name: b.name,
        businessType: b.businessType,
        location: b.location,
        distanceKm: Math.round(dist * 10) / 10,
        estimatedOrderVolume: b.avgOrderVolume,
        estimatedProfit: Math.round(b.avgOrderVolume * ((b.priceRangeMin + b.priceRangeMax) / 2)),
        rank: 0,
        source: "dataset" as const,
        contact: b.contact,
        rating: b.rating,
      };
    });
}

async function osmBuyersNear(
  shopTags: string[],
  locationGeo: { lat: number; lon: number },
  radiusKm: number,
  type: "retailer" | "wholesaler"
): Promise<BuyerResult[]> {
  const shops = await findNearbyShops(locationGeo.lat, locationGeo.lon, radiusKm * 1000, shopTags);
  return shops.slice(0, 10).map((s, i) => ({
    id: `osm-${s.osmId}`,
    name: s.name,
    businessType: type,
    location: `${s.lat.toFixed(3)},${s.lon.toFixed(3)}`,
    distanceKm: s.distanceKm,
    estimatedOrderVolume: type === "wholesaler" ? 500 : 100,
    estimatedProfit: type === "wholesaler" ? 25000 : 5000,
    rank: 0,
    source: "osm" as const,
  }));
}

function mergeBuyers(osm: BuyerResult[], dataset: BuyerResult[]): BuyerResult[] {
  // Deduplicate: if OSM and dataset entries have similar names, prefer dataset (has more info)
  const datasetNames = new Set(dataset.map(d => d.name.toLowerCase().slice(0, 8)));
  const filteredOsm = osm.filter(o => !datasetNames.has(o.name.toLowerCase().slice(0, 8)));
  return [...dataset, ...filteredOsm];
}

// ── Core logic (exported for orchestrator) ────────────────────────────────────

export async function findRetailersLogic(
  product: string,
  location: string,
  radiusKm: number
): Promise<BuyerResult[]> {
  const geo = await geocode(location);
  if (!geo) return [];
  const category = inferCategory(product);
  const tags = categoryToTags(category);
  const [osm, dataset] = await Promise.all([
    osmBuyersNear(tags, geo, radiusKm, "retailer"),
    datasetBuyersNear("retailer", product, geo, radiusKm),
  ]);
  return mergeBuyers(osm, dataset);
}

export async function findWholesalersLogic(
  product: string,
  location: string,
  radiusKm: number
): Promise<BuyerResult[]> {
  const geo = await geocode(location);
  if (!geo) return [];
  const [osm, dataset] = await Promise.all([
    osmBuyersNear(["wholesale", "wholesale_warehouse"], geo, radiusKm, "wholesaler"),
    datasetBuyersNear("wholesaler", product, geo, radiusKm),
  ]);
  return mergeBuyers(osm, dataset);
}

export async function findDistributorsLogic(
  product: string,
  location: string,
  radiusKm: number
): Promise<BuyerResult[]> {
  const geo = await geocode(location);
  if (!geo) return [];
  return datasetBuyersNear("distributor", product, geo, radiusKm);
}

export function rankBuyersLogic(buyers: BuyerResult[], quantity: number, product: string): BuyerResult[] {
  const options: DecisionOption[] = buyers.map(b => ({
    id: b.id,
    label: b.name,
    price: b.estimatedOrderVolume > 0 ? b.estimatedProfit / b.estimatedOrderVolume : 100,
    distanceKm: b.distanceKm,
    extraFactors: {
      reliability: b.rating ?? 3.5,
      volume: b.estimatedOrderVolume,
    },
  }));

  const comparison = compareAndRecommend(options, ["price", "distance", "volume", "reliability"]);
  const scoreMap = new Map(comparison.allOptionsRanked.map((o, i) => [o.id, i + 1]));

  return buyers
    .map(b => ({ ...b, rank: scoreMap.get(b.id) ?? 99 }))
    .sort((a, b) => a.rank - b.rank);
}

export function estimateSalesLogic(buyer: BuyerResult, quantity: number): {
  estimatedUnitsAbsorbed: number;
  estimatedRevenue: number;
  estimatedProfit: number;
} {
  const units = Math.min(buyer.estimatedOrderVolume, quantity);
  const pricePerUnit = buyer.estimatedProfit / Math.max(buyer.estimatedOrderVolume, 1);
  return {
    estimatedUnitsAbsorbed: units,
    estimatedRevenue: Math.round(units * pricePerUnit),
    estimatedProfit: Math.round(units * pricePerUnit * 0.15), // 15% margin estimate
  };
}

// ── MCP Tool Registrations ────────────────────────────────────────────────────

export function registerBuyerDiscoveryTools(server: McpServer): void {
  server.tool(
    "findRetailers",
    "Find retail shops likely to buy your product — merges OpenStreetMap OSM shop data with the internal buyer dataset.",
    {
      product: z.string().describe("Product name"),
      location: z.string().describe("Location to search in"),
      radiusKm: z.number().optional().default(20).describe("Search radius in km"),
    },
    async ({ product, location, radiusKm }) => {
      const buyers = await findRetailersLogic(product, location, radiusKm ?? 20);
      return { content: [{ type: "text", text: JSON.stringify({ found: buyers.length, retailers: buyers }, null, 2) }] };
    }
  );

  server.tool(
    "findWholesalers",
    "Find wholesale buyers for your product — merges OSM wholesale tags with internal dataset.",
    {
      product: z.string().describe("Product name"),
      location: z.string().describe("Location to search in"),
      radiusKm: z.number().optional().default(50).describe("Search radius in km"),
    },
    async ({ product, location, radiusKm }) => {
      const buyers = await findWholesalersLogic(product, location, radiusKm ?? 50);
      return { content: [{ type: "text", text: JSON.stringify({ found: buyers.length, wholesalers: buyers }, null, 2) }] };
    }
  );

  server.tool(
    "findDistributors",
    "Find distributors for your product from the internal dataset (OSM has no reliable distributor tagging).",
    {
      product: z.string().describe("Product name"),
      location: z.string().describe("Location to search in"),
      radiusKm: z.number().optional().default(100).describe("Search radius in km"),
    },
    async ({ product, location, radiusKm }) => {
      const buyers = await findDistributorsLogic(product, location, radiusKm ?? 100);
      return { content: [{ type: "text", text: JSON.stringify({ found: buyers.length, distributors: buyers }, null, 2) }] };
    }
  );

  server.tool(
    "rankBuyers",
    "Rank a list of buyers by price, distance, volume, and reliability using the decision support engine.",
    {
      buyers: z.array(z.object({
        id: z.string(),
        name: z.string(),
        businessType: z.enum(["retailer", "wholesaler", "distributor"]),
        location: z.string(),
        distanceKm: z.number(),
        estimatedOrderVolume: z.number(),
        estimatedProfit: z.number(),
        rank: z.number(),
        source: z.enum(["osm", "dataset"]),
        rating: z.number().optional(),
      })).describe("List of buyers to rank"),
      quantity: z.number().describe("Quantity you want to sell (kg/units)"),
      product: z.string().describe("Product name"),
    },
    async ({ buyers, quantity, product }) => {
      const ranked = rankBuyersLogic(buyers as BuyerResult[], quantity, product);
      return { content: [{ type: "text", text: JSON.stringify({ rankedBuyers: ranked }, null, 2) }] };
    }
  );

  server.tool(
    "estimateSales",
    "Estimate how many units a buyer can absorb and the resulting revenue.",
    {
      buyer: z.object({
        id: z.string(),
        name: z.string(),
        businessType: z.enum(["retailer", "wholesaler", "distributor"]),
        location: z.string(),
        distanceKm: z.number(),
        estimatedOrderVolume: z.number(),
        estimatedProfit: z.number(),
        rank: z.number(),
        source: z.enum(["osm", "dataset"]),
        rating: z.number().optional(),
      }).describe("Buyer details"),
      product: z.string().describe("Product name"),
      quantity: z.number().describe("Quantity available to sell"),
    },
    async ({ buyer, product, quantity }) => {
      const estimate = estimateSalesLogic(buyer as BuyerResult, quantity);
      return { content: [{ type: "text", text: JSON.stringify({ buyer: buyer.name, product, quantity, ...estimate }, null, 2) }] };
    }
  );
}
