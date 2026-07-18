import type { NegotiationPlan } from "../tools/negotiationAssistant.js";
interface DashboardInput {
    title: string;
    intent: string;
    market?: {
        location: string;
        demandScore: number;
        competitionScore: number;
        estimatedSellingPrice: {
            min: number;
            max: number;
            currency: string;
            basis: string;
        };
        confidenceScore: number;
        recommendation: string;
        nearbyBusinesses: Array<{
            name: string;
            distanceKm: number;
            type: string;
        }>;
    };
    buyers?: Array<{
        name: string;
        businessType: string;
        location: string;
        distanceKm: number;
        estimatedOrderVolume: number;
        estimatedProfit: number;
        rank: number;
        source: string;
        rating?: number;
    }>;
    transport?: Array<{
        provider: string;
        vehicleType: string;
        capacityKg: number;
        estimatedCost: number;
        distanceKm: number;
        source?: string;
        destination?: string;
    }>;
    sharedTransport?: Array<{
        provider: string;
        vehicleType: string;
        spareCapacityKg: number;
        sharedCost: number;
        source?: string;
        destination?: string;
    }>;
    negotiation?: NegotiationPlan;
}
export declare function renderDashboard(input: DashboardInput): string;
/** JSON-serialisable dashboard payload for MCP widget consumers */
export declare function dashboardJSON(input: DashboardInput): object;
export {};
//# sourceMappingURL=dashboardRenderer.d.ts.map