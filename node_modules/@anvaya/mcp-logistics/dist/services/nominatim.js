export async function geocodeCity(cityName) {
    // Nominatim expects a descriptive user agent
    const userAgent = 'AnvayaBusinessOS/1.0 (anvaya@example.com)';
    // Format query for city in India to narrow scope
    const query = encodeURIComponent(`${cityName}, India`);
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    const response = await fetch(url, {
        headers: {
            'User-Agent': userAgent,
            'Accept': 'application/json'
        }
    });
    if (!response.ok) {
        throw new Error(`Nominatim API error: ${response.statusText}`);
    }
    const data = await response.json();
    if (!data || data.length === 0) {
        throw new Error(`Could not find coordinates for city: ${cityName}`);
    }
    return {
        lat: parseFloat(data[0].lat),
        lon: parseFloat(data[0].lon),
        display_name: data[0].display_name
    };
}
