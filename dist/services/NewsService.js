// NewsAPI.org sentiment service
// Falls back to neutral mock data when key is absent.
const NEWS_API_BASE = "https://newsapi.org/v2/everything";
// Keywords that imply positive/negative sentiment
const POSITIVE_WORDS = ["surge", "growth", "demand", "export", "rise", "boom", "high", "record", "strong", "profit"];
const NEGATIVE_WORDS = ["fall", "drop", "surplus", "glut", "crash", "low", "decline", "loss", "weak", "import ban"];
export async function getNewsSentiment(productName, location) {
    const key = process.env.NEWS_API_KEY;
    const query = location ? `${productName} ${location} market` : `${productName} market India`;
    if (!key || key === "your_newsapi_key_here") {
        return getMockSentiment(query, productName);
    }
    try {
        const params = new URLSearchParams({
            q: query,
            language: "en",
            sortBy: "publishedAt",
            pageSize: "10",
            apiKey: key,
        });
        const res = await fetch(`${NEWS_API_BASE}?${params}`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok)
            return getMockSentiment(query, productName);
        const json = (await res.json());
        const articles = json.articles ?? [];
        const headlines = articles.map(a => a.title).slice(0, 5);
        // Simple sentiment: count positive/negative keywords in titles
        let posScore = 0;
        let negScore = 0;
        const allText = articles.map(a => `${a.title} ${a.description ?? ""}`).join(" ").toLowerCase();
        POSITIVE_WORDS.forEach(w => { if (allText.includes(w))
            posScore++; });
        NEGATIVE_WORDS.forEach(w => { if (allText.includes(w))
            negScore++; });
        const rawScore = posScore - negScore;
        const sentimentScore = Math.min(100, Math.max(0, 50 + rawScore * 8));
        return {
            query,
            mentionCount: Math.min(json.totalResults, 100),
            sentimentScore,
            headlines,
            source: "newsapi",
        };
    }
    catch {
        return getMockSentiment(query, productName);
    }
}
function getMockSentiment(query, product) {
    // Seed a deterministic pseudo-score based on product name hash
    let hash = 0;
    for (const c of product)
        hash = (hash * 31 + c.charCodeAt(0)) & 0xffff;
    const sentimentScore = 45 + (hash % 30); // 45-75 range, neutral-positive
    const mentionCount = 5 + (hash % 20);
    return {
        query,
        mentionCount,
        sentimentScore,
        headlines: [
            `${product} market sees steady demand across Indian states`,
            `MSME exporters report stable ${product} prices this season`,
            `Wholesale ${product} trade volume grows in Q2`,
        ],
        source: "mock",
    };
}
//# sourceMappingURL=NewsService.js.map