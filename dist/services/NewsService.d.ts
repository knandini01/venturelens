export interface NewsSentiment {
    query: string;
    mentionCount: number;
    sentimentScore: number;
    headlines: string[];
    source: "newsapi" | "mock";
}
export declare function getNewsSentiment(productName: string, location?: string): Promise<NewsSentiment>;
//# sourceMappingURL=NewsService.d.ts.map