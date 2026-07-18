import { z } from "zod";
import { geocode } from "../services/GeoService.js";
import { findNearbyShops } from "../services/OverpassService.js";
import { getCommodityPrice, isAgriculturalProduct } from "../services/AgmarknetService.js";
import { getNewsSentiment } from "../services/NewsService.js";
import { compareAndRecommend } from "./decisionSupport.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ratesConfig = JSON.parse(readFileSync(join(__dirname, "../../config/rates.json"), "utf-8"));
// ── Helpers ──────────────────────────────────────────────────────────────────
function categoryToTags(productCategory) {
    const lower = productCategory.toLowerCase();
    for (const [key, tags] of Object.entries(ratesConfig.categoryToShopTags)) {
        if (lower.includes(key))
            return tags;
    }
    return ratesConfig.categoryToShopTags["general"];
}
function inferCategory(productName) {
    if (isAgriculturalProduct(productName))
        return "agri";
    if (/soap|detergent|shampoo|oil|biscuit|snack|food/i.test(productName))
        return "fmcg";
    if (/cloth|fabric|silk|cotton|textile/i.test(productName))
        return "textiles";
    if (/tablet|capsule|medicine|pharma/i.test(productName))
        return "pharma";
    if (/phone|laptop|electronic/i.test(productName))
        return "electronics";
    if (/craft|art|pottery|handmade|handicraft/i.test(productName))
        return "handicrafts";
    return "general";
}
// ── Core logic (exported for orchestrator reuse) ──────────────────────────────
export async function searchMarketLogic(productName, businessType, targetLocation, budget) {
    const geo = await geocode(targetLocation);
    if (!geo) {
        return {
            location: targetLocation,
            demandScore: 0,
            competitionScore: 0,
            nearbyBusinesses: [],
            estimatedSellingPrice: { min: 0, max: 0, currency: "INR", basis: "estimated" },
            confidenceScore: 0,
            recommendation: `Could not geocode location "${targetLocation}". Please check the location name.`,
        };
    }
    const category = inferCategory(productName);
    const shopTags = categoryToTags(category);
    // Parallel: Overpass + Agmarknet + News
    const [osmShops, commodityPrice, news] = await Promise.all([
        findNearbyShops(geo.lat, geo.lon, 5000, shopTags),
        isAgriculturalProduct(productName) ? getCommodityPrice(productName) : Promise.resolve(null),
        getNewsSentiment(productName, targetLocation),
    ]);
    // Demand score
    const { newsWeightAgri, newsMentionMax, competitorDensityMax, priceStabilityBonus } = ratesConfig.demandScoring;
    const newsScore = Math.min(news.mentionCount / newsMentionMax, 1) * 40;
    const sentimentBonus = ((news.sentimentScore - 50) / 50) * 20;
    const agriBonus = commodityPrice ? priceStabilityBonus : 0;
    const demandScore = Math.min(100, Math.max(0, Math.round(30 + newsScore + sentimentBonus + agriBonus)));
    // Competition score
    const competitionScore = Math.min(100, Math.round((osmShops.length / competitorDensityMax) * 100));
    // Selling price
    let priceRange;
    if (commodityPrice) {
        priceRange = {
            min: Math.round(commodityPrice.minPrice * 10) / 10,
            max: Math.round(commodityPrice.maxPrice * 10) / 10,
            basis: commodityPrice.source === "agmarknet" ? "live" : "estimated",
        };
    }
    else {
        // Rule-based estimate: higher demand/less competition → higher price
        const baseMultiplier = 1 + (demandScore - competitionScore) / 200;
        const roughBase = budget > 0 ? Math.min(budget * 0.4, 500) : 100;
        priceRange = {
            min: Math.round(roughBase * baseMultiplier * 10) / 10,
            max: Math.round(roughBase * baseMultiplier * 1.4 * 10) / 10,
            basis: "estimated",
        };
    }
    // Confidence score
    const hasGeoData = osmShops.length > 0;
    const hasLivePrice = priceRange.basis === "live";
    const hasNews = news.source === "newsapi";
    const confidenceScore = Math.round(40 + (hasGeoData ? 25 : 0) + (hasLivePrice ? 25 : 10) + (hasNews ? 10 : 0));
    // Recommendation text
    let recommendation;
    if (demandScore >= 65 && competitionScore < 50) {
        recommendation = `Strong opportunity in ${targetLocation}. High demand (${demandScore}/100) and manageable competition (${competitionScore}/100). Consider entering this market.`;
    }
    else if (demandScore >= 50 && competitionScore >= 50) {
        recommendation = `Moderate opportunity in ${targetLocation}. Decent demand but significant competition — differentiate on price or quality.`;
    }
    else if (demandScore < 40) {
        recommendation = `Low demand signal for ${productName} in ${targetLocation}. Consider an alternative location.`;
    }
    else {
        recommendation = `Viable market in ${targetLocation} with balanced demand/competition dynamics.`;
    }
    return {
        location: targetLocation,
        demandScore,
        competitionScore,
        nearbyBusinesses: osmShops.slice(0, 10).map(s => ({
            name: s.name,
            distanceKm: s.distanceKm,
            type: s.type,
        })),
        estimatedSellingPrice: { ...priceRange, currency: "INR" },
        confidenceScore,
        recommendation,
    };
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerMarketIntelligenceTools(server) {
    // 1. searchMarket
    server.tool("searchMarket", "Analyze whether a product can be sold profitably in a target market. Geocodes location, finds nearby businesses via OpenStreetMap, fetches commodity prices (Agmarknet for agri), and sentiment (NewsAPI).", {
        productName: z.string().describe("Name of the product to sell"),
        businessType: z.string().describe("Type of business (manufacturer, wholesaler, farmer, etc.)"),
        targetLocation: z.string().describe("Target city/town/location name in India"),
        budget: z.number().optional().default(0).describe("Available budget in INR (optional)"),
    }, async ({ productName, businessType, targetLocation, budget }) => {
        const result = await searchMarketLogic(productName, businessType, targetLocation, budget ?? 0);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    // 2. analyzeDemand
    server.tool("analyzeDemand", "Derive a 0-100 demand score for a product in a location using news mentions, commodity price trends, and business density.", {
        productName: z.string().describe("Product name"),
        targetLocation: z.string().describe("Target location"),
    }, async ({ productName, targetLocation }) => {
        const geo = await geocode(targetLocation);
        const category = inferCategory(productName);
        const shopTags = categoryToTags(category);
        const [osmShops, commodityPrice, news] = await Promise.all([
            geo ? findNearbyShops(geo.lat, geo.lon, 5000, shopTags) : Promise.resolve([]),
            isAgriculturalProduct(productName) ? getCommodityPrice(productName) : Promise.resolve(null),
            getNewsSentiment(productName, targetLocation),
        ]);
        const newsScore = Math.min(news.mentionCount / ratesConfig.demandScoring.newsMentionMax, 1) * 40;
        const sentimentBonus = ((news.sentimentScore - 50) / 50) * 20;
        const agriBonus = commodityPrice ? ratesConfig.demandScoring.priceStabilityBonus : 0;
        const densityScore = Math.min(osmShops.length / 10, 1) * 15;
        const demandScore = Math.min(100, Math.max(0, Math.round(25 + newsScore + sentimentBonus + agriBonus + densityScore)));
        const result = {
            productName,
            targetLocation,
            demandScore,
            breakdown: {
                newsMentions: news.mentionCount,
                newsSentiment: news.sentimentScore,
                businessDensity: osmShops.length,
                hasCommodityPrice: !!commodityPrice,
                commodityModalPrice: commodityPrice?.modalPrice,
            },
            interpretation: demandScore >= 70 ? "High demand" :
                demandScore >= 50 ? "Moderate demand" :
                    demandScore >= 30 ? "Low demand" : "Very low demand",
            topHeadlines: news.headlines.slice(0, 3),
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    // 3. findCompetitors
    server.tool("findCompetitors", "Find nearby competing businesses via OpenStreetMap Overpass API within a given radius.", {
        productCategory: z.string().describe("Product category (fmcg, agri, textiles, etc.)"),
        lat: z.number().describe("Latitude of the search centre"),
        lon: z.number().describe("Longitude of the search centre"),
        radiusKm: z.number().optional().default(5).describe("Search radius in km (default 5)"),
    }, async ({ productCategory, lat, lon, radiusKm }) => {
        const shopTags = categoryToTags(productCategory);
        const shops = await findNearbyShops(lat, lon, (radiusKm ?? 5) * 1000, shopTags);
        const result = {
            searchCentre: { lat, lon },
            radiusKm,
            competitorCount: shops.length,
            competitors: shops.slice(0, 20).map(s => ({
                name: s.name,
                type: s.type,
                distanceKm: s.distanceKm,
                lat: s.lat,
                lon: s.lon,
            })),
            saturationLevel: shops.length >= 20 ? "High" :
                shops.length >= 10 ? "Moderate" : "Low",
        };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    // 4. estimateSellingPrice
    server.tool("estimateSellingPrice", "Estimate a selling price range for a product. Uses Agmarknet live price for agricultural products; rule-based estimate for others.", {
        productName: z.string().describe("Product name"),
        targetLocation: z.string().describe("Target market location"),
    }, async ({ productName, targetLocation }) => {
        const isAgri = isAgriculturalProduct(productName);
        let priceData;
        if (isAgri) {
            const commodityPrice = await getCommodityPrice(productName);
            priceData = commodityPrice
                ? {
                    min: commodityPrice.minPrice,
                    max: commodityPrice.maxPrice,
                    modal: commodityPrice.modalPrice,
                    currency: "INR",
                    unit: "kg",
                    basis: commodityPrice.source,
                    market: commodityPrice.market,
                    date: commodityPrice.date,
                }
                : { min: null, max: null, basis: "unavailable", note: "No price data found for this commodity." };
        }
        else {
            // Non-agri rule-based: news sentiment adjusts baseline
            const news = await getNewsSentiment(productName, targetLocation);
            const sentimentMultiplier = 0.9 + (news.sentimentScore / 100) * 0.3;
            const basePrice = 100; // ₹100/unit baseline for manufactured goods
            priceData = {
                min: Math.round(basePrice * sentimentMultiplier * 0.8 * 10) / 10,
                max: Math.round(basePrice * sentimentMultiplier * 1.5 * 10) / 10,
                modal: Math.round(basePrice * sentimentMultiplier * 10) / 10,
                currency: "INR",
                unit: "unit",
                basis: "estimated",
                note: "Non-agricultural product: price is a rule-based estimate, not live-sourced. Adjust based on your actual cost of production.",
            };
        }
        return { content: [{ type: "text", text: JSON.stringify({ productName, targetLocation, isAgricultural: isAgri, price: priceData }, null, 2) }] };
    });
    // 5. rankMarkets
    server.tool("rankMarkets", "Rank multiple candidate locations for selling a product. Runs full market analysis per location and returns a ranked recommendation.", {
        productName: z.string().describe("Product name"),
        businessType: z.string().describe("Your business type"),
        candidateLocations: z.array(z.string()).describe("List of locations to compare"),
        budget: z.number().optional().default(0).describe("Budget in INR"),
    }, async ({ productName, businessType, candidateLocations, budget }) => {
        // Analyse all locations (rate-limited sequentially for Nominatim)
        const results = [];
        for (const loc of candidateLocations) {
            const r = await searchMarketLogic(productName, businessType, loc, budget ?? 0);
            results.push(r);
            await new Promise(r => setTimeout(r, 1100)); // Nominatim: max 1 req/sec
        }
        // Build decision options
        const options = results.map(r => ({
            id: r.location,
            label: r.location,
            price: r.estimatedSellingPrice.max || 1,
            distanceKm: 0, // location ranking doesn't use distance from user
            extraFactors: {
                demand: r.demandScore,
                competition: 100 - r.competitionScore, // invert: less competition = better
                confidence: r.confidenceScore,
            },
        }));
        const comparison = compareAndRecommend(options, ["price", "reliability"]);
        const ranked = results
            .sort((a, b) => b.demandScore - a.demandScore)
            .map((r, i) => ({ rank: i + 1, ...r }));
        return {
            content: [
                {
                    type: "text",
                    text: JSON.stringify({
                        productName,
                        rankedMarkets: ranked,
                        topRecommendation: comparison.recommended,
                        nearTies: comparison.nearTies,
                    }, null, 2),
                },
            ],
        };
    });
}
//# sourceMappingURL=marketIntelligence.js.map