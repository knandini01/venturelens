// Agmarknet commodity price service via data.gov.in
// API docs: https://data.gov.in/resource/current-daily-price-various-commodities-various-markets-mandi
// Falls back to null when key is missing or API is unavailable.
const AGMARKNET_BASE = "https://api.data.gov.in/resource/9ef84268-d588-465a-a308-a864a43d0070";
// Rough estimated fallback prices (₹ per quintal → converted to per kg in output)
const ESTIMATED_PRICES = {
    saffron: { min: 250000, max: 350000, modal: 300000 }, // per kg
    wheat: { min: 2100, max: 2500, modal: 2300 }, // per quintal
    rice: { min: 2200, max: 2800, modal: 2500 },
    "red chilli": { min: 10000, max: 16000, modal: 12000 },
    turmeric: { min: 12000, max: 18000, modal: 14000 },
    sugar: { min: 3500, max: 4200, modal: 3900 },
    onion: { min: 1500, max: 3000, modal: 2000 },
    tomato: { min: 800, max: 4000, modal: 2000 },
    cotton: { min: 6000, max: 7200, modal: 6500 },
    tea: { min: 3500, max: 6000, modal: 4500 },
    cashew: { min: 75000, max: 100000, modal: 85000 },
    honey: { min: 25000, max: 45000, modal: 35000 },
};
/** Fetch live commodity price from Agmarknet. Returns null if unavailable. */
export async function getCommodityPrice(commodity, state) {
    const key = process.env.AGMARKNET_API_KEY;
    if (!key || key === "your_agmarknet_key_here") {
        return getEstimatedPrice(commodity);
    }
    try {
        const params = new URLSearchParams({
            "api-key": key,
            format: "json",
            limit: "5",
            "filters[commodity]": commodity,
        });
        if (state)
            params.append("filters[state]", state);
        const res = await fetch(`${AGMARKNET_BASE}?${params}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            return getEstimatedPrice(commodity);
        const json = (await res.json());
        if (!json.records?.length)
            return getEstimatedPrice(commodity);
        const r = json.records[0];
        return {
            commodity: r.commodity,
            market: r.market,
            state: r.state,
            minPrice: parseFloat(r.min_price) / 100, // quintal → kg
            maxPrice: parseFloat(r.max_price) / 100,
            modalPrice: parseFloat(r.modal_price) / 100,
            date: r.arrival_date,
            source: "agmarknet",
        };
    }
    catch {
        return getEstimatedPrice(commodity);
    }
}
function getEstimatedPrice(commodity) {
    const key = Object.keys(ESTIMATED_PRICES).find(k => commodity.toLowerCase().includes(k));
    if (!key)
        return null;
    const p = ESTIMATED_PRICES[key];
    // saffron is already per kg, others are per quintal → convert
    const divisor = key === "saffron" || key === "honey" || key === "cashew" ? 1 : 100;
    return {
        commodity,
        market: "Estimated",
        state: "National Average",
        minPrice: p.min / divisor,
        maxPrice: p.max / divisor,
        modalPrice: p.modal / divisor,
        date: new Date().toISOString().split("T")[0],
        source: "estimated",
    };
}
/** Detect if a product/category is agricultural (eligible for Agmarknet pricing). */
export function isAgriculturalProduct(productOrCategory) {
    const agriKeywords = [
        "agri", "grain", "wheat", "rice", "chilli", "turmeric", "sugar", "onion",
        "tomato", "saffron", "tea", "cotton", "honey", "cashew", "apple", "orange",
        "vegetable", "fruit", "spice", "oil", "coconut", "sesame", "pepper", "dal",
        "pulse", "lentil", "soya", "maize", "corn", "jute", "mustard",
    ];
    const lower = productOrCategory.toLowerCase();
    return agriKeywords.some(k => lower.includes(k));
}
//# sourceMappingURL=AgmarknetService.js.map