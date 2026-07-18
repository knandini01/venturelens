import { z } from "zod";
import { geocode, haversineDistance, getRoute } from "../services/GeoService.js";
import { datasetService } from "../services/DatasetService.js";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
const __dirname = dirname(fileURLToPath(import.meta.url));
const ratesConfig = JSON.parse(readFileSync(join(__dirname, "../../config/rates.json"), "utf-8"));
// ── Cost Calculation ──────────────────────────────────────────────────────────
export function calculateCostLogic(distanceKm, cargoWeightKg, vehicleType, productType = "standard") {
    const rates = ratesConfig.vehicleRates[vehicleType] ?? ratesConfig.vehicleRates["mini-truck"];
    const multiplier = ratesConfig.productTypeMultipliers[productType] ?? 1.0;
    const base = rates.baseRate + distanceKm * rates.perKmRate + cargoWeightKg * rates.perKgRate;
    const finalCost = Math.round(base * multiplier * 100) / 100;
    return {
        baseCost: Math.round(base * 100) / 100,
        finalCost,
        multiplier,
        breakdown: {
            baseRate: rates.baseRate,
            distanceCost: Math.round(distanceKm * rates.perKmRate * 100) / 100,
            weightCost: Math.round(cargoWeightKg * rates.perKgRate * 100) / 100,
            productTypeMultiplier: multiplier,
        },
    };
}
function vehicleSupportsProduct(vehicle, productType) {
    if (productType === "perishable" && !vehicle.supportsRefrigeration)
        return false;
    if (productType === "fragile" && !vehicle.supportsFragile)
        return false;
    if (productType === "hazardous" && !vehicle.supportsHazardous)
        return false;
    return true;
}
// ── Core Logic (exported for orchestrator) ────────────────────────────────────
export async function findTransportLogic(pickupLocation, destination, cargoWeightKg, productType, preferredDate) {
    const [pickupGeo, destGeo] = await Promise.all([
        geocode(pickupLocation),
        geocode(destination),
    ]);
    const all = datasetService.getTransport();
    return all
        .filter(t => {
        // Capacity check
        if (t.capacityKg < cargoWeightKg)
            return false;
        // Product type capability
        if (!vehicleSupportsProduct(t, productType))
            return false;
        // Loose location match (fixture matching by city name)
        const srcMatch = t.source.toLowerCase().includes(pickupLocation.toLowerCase()) ||
            pickupLocation.toLowerCase().includes(t.source.toLowerCase());
        const dstMatch = t.destination.toLowerCase().includes(destination.toLowerCase()) ||
            destination.toLowerCase().includes(t.destination.toLowerCase());
        // If we have geocodes, also match by proximity (within 150 km)
        const geoMatch = pickupGeo && destGeo
            ? haversineDistance(pickupGeo.lat, pickupGeo.lon, t.sourceLat, t.sourceLon) < 150 &&
                haversineDistance(destGeo.lat, destGeo.lon, t.destinationLat, t.destinationLon) < 150
            : false;
        return srcMatch || dstMatch || geoMatch;
    })
        .map(t => {
        const dist = haversineDistance(t.sourceLat, t.sourceLon, t.destinationLat, t.destinationLon);
        const costInfo = calculateCostLogic(dist, cargoWeightKg, t.vehicleType, productType);
        return { ...t, distanceKm: Math.round(dist * 10) / 10, estimatedCost: costInfo.finalCost, costBreakdown: costInfo.breakdown };
    })
        .sort((a, b) => a.estimatedCost - b.estimatedCost);
}
export async function findSharedShipmentLogic(pickupLocation, destination, cargoWeightKg, productType, preferredDate) {
    const [pickupGeo, destGeo] = await Promise.all([geocode(pickupLocation), geocode(destination)]);
    const all = datasetService.getTransport();
    return all
        .filter(t => {
        if (t.spareCapacityKg < cargoWeightKg)
            return false;
        if (!vehicleSupportsProduct(t, productType))
            return false;
        const geoMatch = pickupGeo && destGeo
            ? haversineDistance(pickupGeo.lat, pickupGeo.lon, t.sourceLat, t.sourceLon) < 200 &&
                haversineDistance(destGeo.lat, destGeo.lon, t.destinationLat, t.destinationLon) < 200
            : false;
        const nameMatch = t.source.toLowerCase().includes(pickupLocation.toLowerCase()) ||
            t.destination.toLowerCase().includes(destination.toLowerCase());
        return geoMatch || nameMatch;
    })
        .map(t => {
        const dist = haversineDistance(t.sourceLat, t.sourceLon, t.destinationLat, t.destinationLon);
        // Shared cost = proportional share of the vehicle cost
        const fullCost = calculateCostLogic(dist, t.capacityKg, t.vehicleType, productType).finalCost;
        const sharedCost = Math.round((fullCost * (cargoWeightKg / t.capacityKg)) * 100) / 100;
        return { ...t, distanceKm: Math.round(dist * 10) / 10, sharedCost };
    })
        .sort((a, b) => a.sharedCost - b.sharedCost);
}
// ── MCP Tool Registrations ────────────────────────────────────────────────────
export function registerLogisticsTools(server) {
    server.tool("findTransport", "Find available transport providers matching your route, cargo weight, and product type (standard/perishable/fragile/hazardous). Filters by capability flags and estimates cost.", {
        pickupLocation: z.string().describe("Pickup city/location"),
        destination: z.string().describe("Destination city/location"),
        cargoWeightKg: z.number().describe("Cargo weight in kg"),
        productType: z.enum(["standard", "perishable", "fragile", "hazardous"])
            .optional().default("standard").describe("Product type — affects vehicle filtering and cost multiplier"),
        preferredDate: z.string().optional().describe("Preferred travel date (YYYY-MM-DD)"),
    }, async ({ pickupLocation, destination, cargoWeightKg, productType, preferredDate }) => {
        const vehicles = await findTransportLogic(pickupLocation, destination, cargoWeightKg, (productType ?? "standard"), preferredDate);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ found: vehicles.length, vehicles }, null, 2),
                }],
        };
    });
    server.tool("calculateCost", "Calculate transport cost using the formula: (baseRate + distanceKm*perKmRate + cargoWeightKg*perKgRate) * productTypeMultiplier. Rates come from config/rates.json.", {
        distanceKm: z.number().describe("Route distance in km"),
        cargoWeightKg: z.number().describe("Cargo weight in kg"),
        vehicleType: z.string().describe("Vehicle type (mini-truck, pickup, tempo, large-truck, van, refrigerated-van, container-truck)"),
        productType: z.enum(["standard", "perishable", "fragile", "hazardous"])
            .optional().default("standard").describe("Product type — multiplier applied on top of base cost"),
    }, async ({ distanceKm, cargoWeightKg, vehicleType, productType }) => {
        const result = calculateCostLogic(distanceKm, cargoWeightKg, vehicleType, (productType ?? "standard"));
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
    });
    server.tool("routeOptimization", "Geocode pickup and destination via Nominatim, get driving distance/duration via OSRM (falls back to Haversine if unavailable).", {
        pickupLocation: z.string().describe("Pickup city or address"),
        destination: z.string().describe("Destination city or address"),
    }, async ({ pickupLocation, destination }) => {
        const [pickupGeo, destGeo] = await Promise.all([
            geocode(pickupLocation),
            geocode(destination),
        ]);
        if (!pickupGeo || !destGeo) {
            return {
                content: [{
                        type: "text",
                        text: JSON.stringify({ error: "Could not geocode one or both locations.", pickupGeo, destGeo }, null, 2),
                    }],
            };
        }
        const route = await getRoute(pickupGeo.lat, pickupGeo.lon, destGeo.lat, destGeo.lon);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        pickup: { location: pickupLocation, ...pickupGeo },
                        destination: { location: destination, ...destGeo },
                        route,
                    }, null, 2),
                }],
        };
    });
    server.tool("findSharedShipment", "Find vehicles already scheduled on an overlapping route with enough spare capacity for your cargo — enables cost sharing.", {
        pickupLocation: z.string().describe("Your pickup location"),
        destination: z.string().describe("Your destination"),
        cargoWeightKg: z.number().describe("Your cargo weight in kg"),
        productType: z.enum(["standard", "perishable", "fragile", "hazardous"])
            .optional().default("standard"),
        preferredDate: z.string().optional().describe("Preferred date (YYYY-MM-DD)"),
    }, async ({ pickupLocation, destination, cargoWeightKg, productType, preferredDate }) => {
        const options = await findSharedShipmentLogic(pickupLocation, destination, cargoWeightKg, (productType ?? "standard"), preferredDate);
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({ found: options.length, sharedOptions: options }, null, 2),
                }],
        };
    });
    server.tool("estimateSavings", "Calculate savings between solo transport cost and shared shipment cost.", {
        soloCost: z.number().describe("Cost of solo transport in INR"),
        sharedCost: z.number().describe("Cost of shared transport in INR"),
    }, async ({ soloCost, sharedCost }) => {
        const amount = Math.round((soloCost - sharedCost) * 100) / 100;
        const percentage = Math.round(((soloCost - sharedCost) / soloCost) * 1000) / 10;
        return {
            content: [{
                    type: "text",
                    text: JSON.stringify({
                        soloCost,
                        sharedCost,
                        savings: { amount, percentage },
                        verdict: amount > 0 ? `Shared shipping saves you ₹${amount} (${percentage}%)` : "No savings — solo shipping is already optimal.",
                    }, null, 2),
                }],
        };
    });
}
//# sourceMappingURL=logisticsOptimization.js.map