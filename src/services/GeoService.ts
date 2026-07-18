const NOMINATIM_BASE = "https://nominatim.openstreetmap.org";
const OSRM_BASE = process.env.OSRM_BASE_URL ?? "http://router.project-osrm.org";
const USER_AGENT = "Anvaya-MCP/1.0 (business-execution-platform)";

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
export async function geocode(placeName: string): Promise<GeoPoint | null> {
  try {
    const url = `${NOMINATIM_BASE}/search?q=${encodeURIComponent(placeName)}&format=json&limit=1&countrycodes=in`;
    const res = await fetch(url, {
      headers: {
        "User-Agent": USER_AGENT,
        "Accept-Language": "en",
      },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as Array<{ lat: string; lon: string; display_name: string }>;
    if (!data.length) return null;
    return {
      lat: parseFloat(data[0].lat),
      lon: parseFloat(data[0].lon),
      displayName: data[0].display_name,
    };
  } catch {
    return null;
  }
}

/** Haversine great-circle distance in kilometres. */
export function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

/** Get a route distance/duration from OSRM, falling back to Haversine. */
export async function getRoute(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): Promise<RouteResult> {
  try {
    const url = `${OSRM_BASE}/route/v1/driving/${lon1},${lat1};${lon2},${lat2}?overview=false`;
    const res = await fetch(url, {
      signal: AbortSignal.timeout(5000),
      headers: { "User-Agent": USER_AGENT },
    });
    if (!res.ok) throw new Error("OSRM non-OK");
    const data = (await res.json()) as {
      code: string;
      routes?: Array<{ distance: number; duration: number }>;
    };
    if (data.code !== "Ok" || !data.routes?.length) throw new Error("OSRM no route");
    const route = data.routes[0];
    return {
      distanceKm: Math.round((route.distance / 1000) * 10) / 10,
      estimatedDurationHrs: Math.round((route.duration / 3600) * 10) / 10,
      source: "osrm",
    };
  } catch {
    const distKm = haversineDistance(lat1, lon1, lat2, lon2);
    return {
      distanceKm: Math.round(distKm * 10) / 10,
      estimatedDurationHrs: Math.round((distKm / 60) * 10) / 10, // ~60 km/h avg
      source: "haversine",
    };
  }
}

/** Geocode two places and compute the route between them. */
export async function geocodeAndRoute(
  pickup: string,
  destination: string
): Promise<{ pickup: GeoPoint | null; destination: GeoPoint | null; route: RouteResult | null }> {
  const [pickupGeo, destGeo] = await Promise.all([geocode(pickup), geocode(destination)]);
  if (!pickupGeo || !destGeo) {
    return { pickup: pickupGeo, destination: destGeo, route: null };
  }
  const route = await getRoute(pickupGeo.lat, pickupGeo.lon, destGeo.lat, destGeo.lon);
  return { pickup: pickupGeo, destination: destGeo, route };
}
