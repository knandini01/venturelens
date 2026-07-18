export interface Buyer {
    id: string;
    name: string;
    businessType: "retailer" | "wholesaler" | "distributor";
    category: string;
    location: string;
    lat: number;
    lon: number;
    avgOrderVolume: number;
    priceRangeMin: number;
    priceRangeMax: number;
    contact: string;
    phone: string;
    rating: number;
    yearsInBusiness: number;
}
export interface Supplier {
    id: string;
    name: string;
    location: string;
    lat: number;
    lon: number;
    product: string;
    category: string;
    unitPrice: number;
    unit: string;
    availableQuantity: number;
    minOrderQty: number;
    leadTimeDays: number;
    contact: string;
    phone: string;
    rating: number;
    isOrganic: boolean;
    certifications: string[];
}
export interface Transport {
    id: string;
    provider: string;
    vehicleType: string;
    capacityKg: number;
    source: string;
    sourceLat: number;
    sourceLon: number;
    destination: string;
    destinationLat: number;
    destinationLon: number;
    travelDate: string;
    baseRate: number;
    costPerKg: number;
    spareCapacityKg: number;
    supportsRefrigeration: boolean;
    supportsFragile: boolean;
    supportsHazardous: boolean;
    contactPhone: string;
    rating: number;
}
export type DatasetName = "buyers" | "suppliers" | "transport";
declare class DatasetService {
    private buyers;
    private suppliers;
    private transport;
    constructor();
    private getDataset;
    findAll<T>(dataset: DatasetName): T[];
    findById<T>(dataset: DatasetName, id: string): T | null;
    /**
     * Filter dataset by exact-match or range criteria.
     * filters: { key: value } for exact match,
     *          { key: { gte: n } } or { key: { lte: n } } for range,
     *          { key: { contains: str } } for partial string match (case-insensitive)
     */
    findByFilters<T>(dataset: DatasetName, filters: Record<string, unknown>): T[];
    getBuyers(): Buyer[];
    getSuppliers(): Supplier[];
    getTransport(): Transport[];
}
export declare const datasetService: DatasetService;
export {};
//# sourceMappingURL=DatasetService.d.ts.map