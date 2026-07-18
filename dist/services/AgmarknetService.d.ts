export interface CommodityPrice {
    commodity: string;
    market: string;
    state: string;
    minPrice: number;
    maxPrice: number;
    modalPrice: number;
    date: string;
    source: "agmarknet" | "estimated";
}
/** Fetch live commodity price from Agmarknet. Returns null if unavailable. */
export declare function getCommodityPrice(commodity: string, state?: string): Promise<CommodityPrice | null>;
/** Detect if a product/category is agricultural (eligible for Agmarknet pricing). */
export declare function isAgriculturalProduct(productOrCategory: string): boolean;
//# sourceMappingURL=AgmarknetService.d.ts.map