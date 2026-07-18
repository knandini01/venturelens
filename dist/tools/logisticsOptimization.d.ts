import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Transport } from "../services/DatasetService.js";
export type ProductType = "standard" | "perishable" | "fragile" | "hazardous";
export declare function calculateCostLogic(distanceKm: number, cargoWeightKg: number, vehicleType: string, productType?: ProductType): {
    baseCost: number;
    finalCost: number;
    multiplier: number;
    breakdown: Record<string, number>;
};
export declare function findTransportLogic(pickupLocation: string, destination: string, cargoWeightKg: number, productType: ProductType, preferredDate?: string): Promise<Array<Transport & {
    distanceKm: number;
    estimatedCost: number;
    costBreakdown: Record<string, number>;
}>>;
export declare function findSharedShipmentLogic(pickupLocation: string, destination: string, cargoWeightKg: number, productType: ProductType, preferredDate?: string): Promise<Array<Transport & {
    distanceKm: number;
    sharedCost: number;
}>>;
export declare function registerLogisticsTools(server: McpServer): void;
//# sourceMappingURL=logisticsOptimization.d.ts.map