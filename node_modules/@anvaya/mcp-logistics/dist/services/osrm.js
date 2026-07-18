export async function getRoute(startLat, startLon, endLat, endLon) {
    // OSRM Public API URL format:
    // http://router.project-osrm.org/route/v1/driving/{lon},{lat};{lon},{lat}?overview=false
    const url = `http://router.project-osrm.org/route/v1/driving/${startLon},${startLat};${endLon},${endLat}?overview=false`;
    const response = await fetch(url);
    if (!response.ok) {
        throw new Error(`OSRM API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (data.code !== 'Ok' || !data.routes || data.routes.length === 0) {
        throw new Error('No route found');
    }
    const route = data.routes[0];
    const distance_km = route.distance / 1000;
    const duration_hours = route.duration / 3600;
    return {
        distance_km,
        duration_hours,
        route_summary: `Distance: ${distance_km.toFixed(1)} km, Duration: ${duration_hours.toFixed(1)} hours`
    };
}
