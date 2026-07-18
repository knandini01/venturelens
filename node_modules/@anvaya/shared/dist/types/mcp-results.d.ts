export type McpResult<T> = {
    success: true;
    data: T;
    source: "live" | "estimated" | "seed_data";
    metadata?: {
        api_used?: string;
        cached?: boolean;
        timestamp: string;
    };
} | {
    success: false;
    error: string;
    error_code: "NO_RESULTS" | "API_FAILURE" | "INVALID_INPUT" | "MISSING_PARAM";
    suggestion?: string;
};
