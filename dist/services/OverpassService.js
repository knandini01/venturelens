const OVERPASS_URL = "https://overpass-api.de/api/interpreter";
const USER_AGENT = "Anvaya-MCP/1.0 (business-execution-platform)";
// Simple in-memory cache: key → {data, ts}
const cache = new Map();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes per session
/**
 * Query Overpass for shops/amenities near a point.
 * shopTags: e.g. ["supermarket","convenience","general"]
 */
export async function findNearbyShops(lat, lon, radiusM, shopTags) {
    const cacheKey = `${lat.toFixed(3)},${lon.toFixed(3)},${radiusM},${shopTags.sort().join("|")}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
        return enrichWithDistance(cached.data, lat, lon);
    }
    // Build Overpass QL — union of shop=tag queries
    const shopFilters = shopTags
        .map(tag => `node["shop"="${tag}"](around:${radiusM},${lat},${lon});`)
        .join("\n");
    const amenityFilters = `node["amenity"="marketplace"](around:${radiusM},${lat},${lon});`;
    const query = `[out:json][timeout:15];
(
  ${shopFilters}
  ${amenityFilters}
);
out body;`;
    try {
        const res = await fetch(OVERPASS_URL, {
            method: "POST",
            headers: {
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": USER_AGENT,
            },
            body: `data=${encodeURIComponent(query)}`,
            signal: AbortSignal.timeout(18000),
        });
        if (!res.ok)
            return [];
        const json = (await res.json());
        cache.set(cacheKey, { data: json.elements, ts: Date.now() });
        return enrichWithDistance(json.elements, lat, lon);
    }
    catch {
        return [];
    }
}
function haversine(lat1, lon1, lat2, lon2) {
    const R = 6371;
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a = Math.sin(dLat / 2) ** 2 +
        Math.cos((lat1 * Math.PI) / 180) *
            Math.cos((lat2 * Math.PI) / 180) *
            Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
function enrichWithDistance(elements, refLat, refLon) {
    return elements
        .filter(e => e.lat !== undefined && e.lon !== undefined)
        .map(e => ({
        osmId: e.id,
        name: e.tags?.name ?? "Unknown Business",
        type: e.tags?.shop ?? e.tags?.amenity ?? "shop",
        lat: e.lat,
        lon: e.lon,
        distanceKm: Math.round(haversine(refLat, refLon, e.lat, e.lon) * 10) / 10,
        tags: e.tags ?? {},
    }))
        .sort((a, b) => a.distanceKm - b.distanceKm);
}
//# sourceMappingURL=OverpassService.js.map