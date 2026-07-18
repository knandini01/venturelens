import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { compareAndRecommend } from "./decisionSupport.js";
import { type ProductType } from "./logisticsOptimization.js";
export interface SupplierResult {
    id: string;
    name: string;
    location: string;
    distanceKm: number;
    product: string;
    unitPrice: number;
    unit: string;
    availableQuantity: number;
    minOrderQty: number;
    leadTimeDays: number;
    estimatedDeliveryDays: number;
    estimatedDeliveryCost: number;
    rating: number;
    certifications: string[];
}
export declare function findSupplierLogic(productName: string, quantity: number, location: string, radiusKm?: number): Promise<SupplierResult[]>;
export declare function findRareProductLogic(productName: string): Promise<SupplierResult[]>;
export declare function comparePricesLogic(suppliers: SupplierResult[]): {
    comparison: ReturnType<typeof compareAndRecommend>;
    sorted: SupplierResult[];
};
export declare function estimateDeliveryLogic(supplierLocation: string, destination: string, cargoWeightKg: number, productType?: ProductType, leadTimeDays?: number): Promise<{
    distanceKm: number;
    durationHrs: number;
    deliveryCost: number;
    totalDays: number;
    routeSource: string;
}>;
export declare function registerInventoryTools(server: McpServer): void;
//# sourceMappingURL=inventoryMatching.d.ts.map