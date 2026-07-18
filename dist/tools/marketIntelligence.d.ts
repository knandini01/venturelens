import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
interface MarketResult {
    location: string;
    demandScore: number;
    competitionScore: number;
    nearbyBusinesses: Array<{
        name: string;
        distanceKm: number;
        type: string;
    }>;
    estimatedSellingPrice: {
        min: number;
        max: number;
        currency: string;
        basis: "live" | "estimated";
    };
    confidenceScore: number;
    recommendation: string;
}
export declare function searchMarketLogic(productName: string, businessType: string, targetLocation: string, budget: number): Promise<MarketResult>;
export declare function registerMarketIntelligenceTools(server: McpServer): void;
export {};
//# sourceMappingURL=marketIntelligence.d.ts.map