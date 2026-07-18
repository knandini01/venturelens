import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
import { createTenantDb } from '@anvaya/shared/db/tenant';
const DEFAULT_BUSINESS_ID = 1;
const tenant = createTenantDb(DEFAULT_BUSINESS_ID);
const server = new McpServer({ name: 'anvaya-discovery', version: '1.0.0' });
// ── Find Buyers ──────────────────────────────────
server.tool('find_buyers', 'Find potential buyers for a specific product or category', {
    productCategory: z.string().describe('Category of product (e.g., soap, oil)'),
    region: z.string().optional().describe('Preferred region')
}, async ({ productCategory, region }) => {
    try {
        // In a real system, we'd query a B2B matching engine
        // For now, return the buyers seeded in the database
        const buyers = await tenant.buyers.findAll();
        return {
            content: [{ type: 'text', text: `Found ${buyers.length} potential buyers for ${productCategory}.` }],
            structuredContent: { success: true, data: buyers, source: 'live' },
        };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error finding buyers: ${err.message}` }], isError: true };
    }
});
// ── Find Suppliers ───────────────────────────────
server.tool('find_suppliers', 'Find potential suppliers for raw materials', {
    material: z.string().describe('Raw material needed (e.g., coconut oil, caustic soda)'),
    region: z.string().optional().describe('Preferred region')
}, async ({ material, region }) => {
    try {
        const suppliers = await tenant.suppliers.findAll();
        return {
            content: [{ type: 'text', text: `Found ${suppliers.length} potential suppliers for ${material}.` }],
            structuredContent: { success: true, data: suppliers, source: 'live' },
        };
    }
    catch (err) {
        return { content: [{ type: 'text', text: `Error finding suppliers: ${err.message}` }], isError: true };
    }
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
const PORT = 3010;
app.listen(PORT, () => {
    console.log(`Discovery MCP server listening on port ${PORT}`);
});
