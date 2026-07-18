export interface DecisionOption {
    id: string;
    label: string;
    price: number;
    distanceKm: number;
    extraFactors?: Record<string, number | string>;
}
export interface ScoredOption extends DecisionOption {
    score: number;
}
export interface CompareResult {
    recommended: {
        id: string;
        label: string;
        reasoning: string;
    };
    nearTies: Array<{
        id: string;
        label: string;
        tradeoffNote: string;
    }> | null;
    allOptionsRanked: Array<{
        id: string;
        label: string;
        score: number;
        price: number;
        distanceKm: number;
    }>;
}
/**
 * Core decision support: compute weighted score, detect near-ties, produce trade-off text.
 * criteria: which factors matter — subset of ["price","distance","reliability","volume"]
 */
export declare function compareAndRecommend(options: DecisionOption[], criteria?: string[]): CompareResult;
//# sourceMappingURL=decisionSupport.d.ts.map