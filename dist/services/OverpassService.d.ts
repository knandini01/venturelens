export interface OsmElement {
    id: number;
    type: "node" | "way" | "relation";
    lat?: number;
    lon?: number;
    tags?: Record<string, string>;
}
export interface NearbyBusiness {
    osmId: number;
    name: string;
    type: string;
    lat: number;
    lon: number;
    distanceKm: number;
    tags: Record<string, string>;
}
/**
 * Query Overpass for shops/amenities near a point.
 * shopTags: e.g. ["supermarket","convenience","general"]
 */
export declare function findNearbyShops(lat: number, lon: number, radiusM: number, shopTags: string[]): Promise<NearbyBusiness[]>;
//# sourceMappingURL=OverpassService.d.ts.map