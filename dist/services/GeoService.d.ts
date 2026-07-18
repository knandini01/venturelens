export interface GeoPoint {
    lat: number;
    lon: number;
    displayName: string;
}
export interface RouteResult {
    distanceKm: number;
    estimatedDurationHrs: number;
    source: "osrm" | "haversine";
}
/** Geocode a place name via Nominatim (OSM). Returns null on failure. */
export declare function geocode(placeName: string): Promise<GeoPoint | null>;
/** Haversine great-circle distance in kilometres. */
export declare function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number;
/** Get a route distance/duration from OSRM, falling back to Haversine. */
export declare function getRoute(lat1: number, lon1: number, lat2: number, lon2: number): Promise<RouteResult>;
/** Geocode two places and compute the route between them. */
export declare function geocodeAndRoute(pickup: string, destination: string): Promise<{
    pickup: GeoPoint | null;
    destination: GeoPoint | null;
    route: RouteResult | null;
}>;
//# sourceMappingURL=GeoService.d.ts.map