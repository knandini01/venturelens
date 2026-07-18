import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
export interface NegotiationPlan {
    strategy: string;
    suggestedOffer: number;
    maxAcceptable: number;
    floor: number;
    incrementStep: number;
    messageDraft: string;
    expectedSavings: {
        amount: number;
        percentage: number;
    };
}
export declare function generateNegotiationLogic(currentCost: number, averageMarketRate: number, vehicleType: string, buyerDetails: string): NegotiationPlan;
export declare function generateMessageLogic(openingOffer: number, context: {
    currentCost: number;
    averageMarketRate: number;
    vehicleType: string;
    buyerDetails: string;
}): string;
export declare function callSummaryLogic(outcome: {
    agreedRate: number;
    vehicleType: string;
    route: string;
    date: string;
    notes: string;
}): string;
export declare function priceSuggestionLogic(currentCost: number, averageMarketRate: number): {
    offer: number;
    maxAcceptable: number;
    expectedSavings: {
        amount: number;
        percentage: number;
    };
};
export interface NegotiationRecommendation {
    shouldNegotiate: boolean;
    reason: string;
    potentialSavings: number;
    confidence: "high" | "medium" | "low";
}
export declare function shouldNegotiateLogic(currentCost: number, averageMarketRate: number, dealerRating: number): NegotiationRecommendation;
export interface ContractDraft {
    contractType: "6-month" | "1-year";
    parties: {
        seller: string;
        buyer: string;
    };
    product: string;
    monthlyQuantity: number;
    unit: string;
    basePrice: number;
    contractPrice: number;
    discountPercent: number;
    totalContractValue: number;
    terms: string[];
    contractText: string;
}
export declare function draftContractLogic(params: {
    contractType: "6-month" | "1-year";
    sellerName: string;
    buyerName: string;
    product: string;
    monthlyQuantity: number;
    unit: string;
    basePrice: number;
}): ContractDraft;
export declare function registerNegotiationTools(server: McpServer): void;
//# sourceMappingURL=negotiationAssistant.d.ts.map