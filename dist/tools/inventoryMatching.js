import { z } from "zod";
import { geocode, haversineDistance } from "../services/GeoService.js";
import { datasetService } from "../services/DatasetService.js";
import { compareAndRecommend } from "./decisionSupport.js";
import { calculateCostLogic } from "./logisticsOptimization.js";
export async function findSupplierLogic(productName, quantity, location, radiusKm = 500) {
    const geo = await geocode(location);
    const all = datasetService.getSuppliers();
    const matching = all.filter(s => {
        const productMatch = s.product.toLowerCase().includes(productName.toLowerCase()) ||
            productName.toLowerCase().includes(s.product.toLowerCase()) ||
            s.category.toLowerCase().includes(productName.toLowerCase());
        const hasEnough = s.availableQuantity >= quantity;
        if (!productMatch)
            return false;
        if (!hasEnough)
            return false;
        if (geo) {
            const dist = haversineDistance(geo.lat, geo.lon, s.lat, s.lon);
            return dist <= radiusKm;
        }
        return true;
    });
    return Promise.all(matching.map(async (s) => {
        const dist = geo ? haversineDistance(geo.lat, geo.lon, s.lat, s.lon) : 0;
        // Simple delivery days: 1 day per 200 km + lead time
        const transitDays = Math.ceil(dist / 200);
        const deliveryDays = s.leadTimeDays + transitDays;
        const deliveryCost = calculateCostLogic(dist, quantity, "mini-truck", "standard").finalCost;
        return {
            id: s.id,
            name: s.name,
            location: s.location,
            distanceKm: Math.round(dist * 10) / 10,
            product: s.product,
            unitPrice: s.unitPrice,
            unit: s.unit,
            availableQuantity: s.availableQuantity,
            minOrderQty: s.minOrderQty,
            leadTimeDays: s.leadTimeDays,
            estimatedDeliveryDays: deliveryDays,
            estimatedDeliveryCost: deliveryCost,
            rating: s.rating,
            certifications: s.certifications,
        };
    }));
}
export async function findRareProductLogic(productName) {
    const all = datasetService.getSuppliers();
    const matching = all.filter(s => s.product.toLowerCase().includes(productName.toLowerCase()) ||
        productName.toLowerCase().includes(s.product.toLowerCase()) ||
        s.category.toLowerCase().includes(productName.toLowerCase()));
    if (!matching.length)
        return [];
    return matching.map(s => ({
        id: s.id,
        name: s.name,
        location: s.location,
        distanceKm: 9999, // unknown without requester location
        product: s.product,
        unitPrice: s.unitPrice,
        unit: s.unit,
        availableQuantity: s.availableQuantity,
        minOrderQty: s.minOrderQty,
        leadTimeDays: s.leadTimeDays,
        estimatedDeliveryDays: s.leadTimeDays + 3,
        estimatedDeliveryCost: 0,
        rating: s.rating,
        certifications: s.certifications,
    }));
}
export function comparePricesLogic(suppliers) {
    const options = suppliers.map(s => ({
        id: s.id,
        label: `${s.name} (${s.location})`,
        price: s.unitPrice,
        distanceKm: s.distanceKm < 9999 ? s.distanceKm : 500,
        extraFactors: {
            reliability: s.rating,
            deliveryDays: s.estimatedDeliveryDays,
        },
    }));
    const comparison = compareAndRecommend(options, ["price", "distance", "reliability"]);
    const sorted = [...suppliers].sort((a, b) => a.unitPrice - b.unitPrice);
    return { comparison, sorted };
}
export async function estimateDeliveryLogic(supplierLocation, destination, cargoWeightKg, productType = "standard", leadTimeDays = 2) {
    const [supGeo, destGeo] = await Promise.all([geocode(supplierLocation), geocode(destination)]);
    if (!supGeo || !destGeo) {
        return { distanceKm: 0, durationHrs: 0, deliveryCost: 0, totalDays: leadTimeDays + 3, routeSource: "estimate" };
    }
    const dist = haversineDistance(supGeo.lat, supGeo.lon, destGeo.lat, destGeo.lon);
    const durationHrs = dist / 60;
    const costInfo = calculateCostLogic(dist, cargoWeightKg, "mini-truck", productType);
    const transitDays = Math.ceil(durationHrs / 10); // ~10 hrs driving/day
    return {
        distanceKm: Math.round(dist * 10) / 10,
        durationHrs: Math.round(durationHrs * 10) / 10,
        deliveryCost: costInfo.finalCost,
        totalDays: leadTimeDays + transitDays,
        routeSource: "haversine",
    };
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerInventoryTools(server) {
    server.tool("findSupplier", "Find suppliers for a product near a location, with distance, pricing, delivery estimate, and certifications.", {
        productName: z.string().describe("Product to source"),
        quantity: z.number().describe("Required quantity"),
        location: z.string().describe("Your location (buyer's city)"),
        radiusKm: z.number().optional().default(500).describe("Search radius in km"),
    }, async ({ productName, quantity, location, radiusKm }) => {
        const suppliers = await findSupplierLogic(productName, quantity, location, radiusKm ?? 500);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ found: suppliers.length, suppliers }, null, 2),
                }],
        };
    });
    server.tool("findRareProduct", "Fallback: search entire supplier dataset for a rare/specialty product regardless of location.", {
        productName: z.string().describe("Rare or specialty product name"),
    }, async ({ productName }) => {
        const suppliers = await findRareProductLogic(productName);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        found: suppliers.length,
                        note: "Results are nationwide — no location filter applied.",
                        suppliers,
                    }, null, 2),
                }],
        };
    });
    server.tool("comparePrices", "Compare supplier prices using the shared decision-support engine. Detects near-ties and provides trade-off explanation.", {
        suppliers: z.array(z.object({
            id: z.string(),
            name: z.string(),
            location: z.string(),
            distanceKm: z.number(),
            product: z.string(),
            unitPrice: z.number(),
            unit: z.string(),
            availableQuantity: z.number(),
            minOrderQty: z.number(),
            leadTimeDays: z.number(),
            estimatedDeliveryDays: z.number(),
            estimatedDeliveryCost: z.number(),
            rating: z.number(),
            certifications: z.array(z.string()),
        })).describe("Suppliers to compare"),
    }, async ({ suppliers }) => {
        const result = comparePricesLogic(suppliers);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        recommended: result.comparison.recommended,
                        nearTies: result.comparison.nearTies,
                        allOptionsRanked: result.comparison.allOptionsRanked,
                        sortedByPrice: result.sorted.map(s => ({
                            name: s.name, location: s.location, unitPrice: s.unitPrice, unit: s.unit, distanceKm: s.distanceKm,
                        })),
                    }, null, 2),
                }],
        };
    });
    server.tool("estimateDelivery", "Estimate delivery cost and time from a supplier to your location, using Logistics tools for route and cost.", {
        supplierLocation: z.string().describe("Supplier's city/location"),
        destination: z.string().describe("Your delivery destination"),
        cargoWeightKg: z.number().describe("Cargo weight in kg"),
        productType: z.enum(["standard", "perishable", "fragile", "hazardous"])
            .optional().default("standard"),
        leadTimeDays: z.number().optional().default(2).describe("Supplier lead time in days"),
    }, async ({ supplierLocation, destination, cargoWeightKg, productType, leadTimeDays }) => {
        const result = await estimateDeliveryLogic(supplierLocation, destination, cargoWeightKg, (productType ?? "standard"), leadTimeDays ?? 2);
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
}
//# sourceMappingURL=inventoryMatching.js.map