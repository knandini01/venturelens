import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
const server = new McpServer({ name: 'anvaya-market', version: '1.0.0' });
// ── Get Market Prices ────────────────────────────
server.tool('get_market_prices', 'Get current market prices for a specific commodity in different regions (e.g., coconut, soap, palm oil)', { commodity: z.string().describe('Name of the commodity') }, async ({ commodity }) => {
    // In a real system, this would call Agmarknet or a commodity API
    // Returning mock data for demonstration
    const mockPrices = {
        'Kerala': { price: 150, unit: 'per kg', trend: 'up 2%' },
        'Tamil Nadu': { price: 145, unit: 'per kg', trend: 'down 1%' },
        'Karnataka': { price: 148, unit: 'per kg', trend: 'stable' }
    };
    return {
        content: [{ type: 'text', text: `Market prices for ${commodity}: \n${JSON.stringify(mockPrices, null, 2)}` }],
        structuredContent: { success: true, data: mockPrices, source: 'estimated' },
    };
});
// ── Get News Summary ─────────────────────────────
server.tool('get_news_summary', 'Get a summary of recent news affecting a specific industry or commodity', { topic: z.string().describe('Industry or commodity topic') }, async ({ topic }) => {
    // In a real system, this would call a News API
    const mockNews = [
        { headline: `Heavy rains in Kerala expected to impact ${topic} yields`, sentiment: 'negative' },
        { headline: `New government subsidies announced for ${topic} processing`, sentiment: 'positive' }
    ];
    return {
        content: [{ type: 'text', text: `News for ${topic}: \n${JSON.stringify(mockNews, null, 2)}` }],
        structuredContent: { success: true, data: mockNews, source: 'estimated' },
    };
});
// ── HTTP Server Setup ────────────────────────────
const app = express();
let transport;
app.get('/sse', async (req, res) => {
    transport = new SSEServerTransport("/messages", res);
    await server.connect(transport);
});
app.post('/messages', async (req, res) => {
    if (transport) {
        await transport.handlePostMessage(req, res);
    }
    else {
        res.status(400).json({ error: 'No active session' });
    }
});
const PORT = 3009;
app.listen(PORT, () => {
    console.log(`Market Intelligence MCP server listening on port ${PORT}`);
});
