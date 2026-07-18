import express from 'express';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { SSEServerTransport } from '@modelcontextprotocol/sdk/server/sse.js';
import { z } from 'zod';
const server = new McpServer({ name: 'anvaya-negotiation', version: '1.0.0' });
// ── Initiate Negotiation (Requires Conf) ─────────
server.tool('initiate_negotiation', 'Start a negotiation with a buyer or supplier for a specific product and price. Requires user confirmation.', {
    counterpartyId: z.number().describe('Buyer or Supplier ID'),
    counterpartyType: z.enum(['buyer', 'supplier']),
    productId: z.number(),
    proposedPrice: z.number(),
    proposedQuantity: z.number(),
}, async (payload) => {
    return {
        content: [{ type: 'text', text: `Requires confirmation to initiate negotiation` }],
        structuredContent: {
            requires_confirmation: true,
            action: 'initiate_negotiation',
            summary: `Propose ${payload.proposedQuantity} units at ₹${payload.proposedPrice} to ${payload.counterpartyType} ${payload.counterpartyId}`,
            payload,
        },
    };
});
// ── Accept Offer (Requires Conf) ─────────────────
server.tool('accept_offer', 'Accept an offer or counter-offer to close the negotiation. Requires user confirmation.', { negotiationId: z.number() }, async (payload) => {
    return {
        content: [{ type: 'text', text: `Requires confirmation to accept offer` }],
        structuredContent: {
            requires_confirmation: true,
            action: 'accept_offer',
            summary: `Accept terms for negotiation ${payload.negotiationId}`,
            payload,
        },
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
const PORT = 3011;
app.listen(PORT, () => {
    console.log(`Negotiation MCP server listening on port ${PORT}`);
});
