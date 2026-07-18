import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
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
export declare function findRetailersLogic(product: string, location: string, radiusKm: number): Promise<BuyerResult[]>;
export declare function findWholesalersLogic(product: string, location: string, radiusKm: number): Promise<BuyerResult[]>;
export declare function findDistributorsLogic(product: string, location: string, radiusKm: number): Promise<BuyerResult[]>;
export declare function rankBuyersLogic(buyers: BuyerResult[], quantity: number, product: string): BuyerResult[];
export declare function estimateSalesLogic(buyer: BuyerResult, quantity: number): {
    estimatedUnitsAbsorbed: number;
    estimatedRevenue: number;
    estimatedProfit: number;
};
export declare function registerBuyerDiscoveryTools(server: McpServer): void;
export {};
//# sourceMappingURL=buyerDiscovery.d.ts.map